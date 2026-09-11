/**
 * InputHub: the SessionInputResolver implementation (`ctx.conversation.input`) — one
 * SessionInputShell per session, created inside the uiSession provide
 * materialization (the 'input' standard-kit entry IS the
 * creation trigger) and torn down by the scope disposer (instance-and-scope
 * share one lifecycle). The hub registers the scoped input-mutation
 * listeners on each Session context and owns the default-sink choreography: every session is a
 * real host entity, so the sink is one unconditional prompt path.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {
  ISessions, SessionBinding, SessionFace, SessionSummary,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { queueReadFaceOf } from './queue-store.ts'
import type {
  ComposerKeyboard, DraftAttachmentId, DraftAttachmentSerializationResult, InputTriggerController,
  SessionInputResolver, SessionInput, SubmitOutcome,
} from '../contract/input.ts'
import type { InputSubmitMode } from '../contract/composer-submission.ts'
import type { PopupDismissFace } from './facade.ts'
import { SessionInputShell } from './facade.ts'

/** Structural command face for per-session popup resolution. */
interface CommandFace {
  popupFor(actx: Context): PopupDismissFace
}

/** Optional input-trigger service resolved without importing its implementation. */
interface InputTriggerServiceFace {
  /** @param actx - Session scope. @returns that Session's trigger provider. */
  sessionOf(actx: Context): InputTriggerController
}

/** Attachment-send face resolved lazily to keep hub/service construction acyclic. */
interface ConversationAttachmentFace {
  sendSession(
    session: SessionFace,
    text: string,
    attachmentIds: readonly DraftAttachmentId[],
    mode: InputSubmitMode,
    signal?: AbortSignal,
  ): Promise<SubmitOutcome>
  serializeDraftAttachments(attachmentIds: readonly DraftAttachmentId[]): Promise<DraftAttachmentSerializationResult>
  releaseDraftAttachment(id: DraftAttachmentId): void
  rebindDraftFiles(sessionId: SessionId, ids: readonly DraftAttachmentId[]): void
}

/**
 * Whether one summary describes the first message of a blank project-free
 * conversation: no directory was chosen and no workspace owns it, so the
 * send allocates a topic directory instead of sharing the fallback root.
 * @param summary - the addressed Session's list summary.
 * @returns true when the send should promote the conversation.
 */
export function isProjectFreeFirstSend(summary: SessionSummary | undefined): boolean {
  return summary !== undefined
    && summary.blank
    && summary.cwd === undefined
    && summary.origin === undefined
}

/** Session-addressed input facade registry (SessionInputResolver face + composer-layer extras). */
export class InputHub implements SessionInputResolver {
  private readonly shells = new Map<SessionId, SessionInputShell>()

  /**
   * @param ctx - client root context (services resolved lazily per call — boot order stays free).
   * @param t - conversation-namespace translate thunk (reads the active locale at call time).
   */
  constructor(
    private readonly rootCtx: Context,
    private readonly t: TranslateNS<'conversation'>,
  ) {}

  /**
   * Resolve the facade for one session-scope ctx (SessionInputResolver face).
   * @param actx - session-scope context.
   * @returns the resident per-session facade.
   */
  for(actx: Context): SessionInput {
    const sessions = this.sessions()
    const id = sessions.scopeOf(actx)
    if (id === undefined) throw new Error('conversation.input.for requires a session scope')
    return this.shell(id)
  }

  /**
   * Resident shell for one session binding — the provide-channel entry
   * (called during scope materialization, BEFORE the scope record is
   * queryable, hence binding-fed and hence the thunked slash/popup deps).
   * Wires the scoped event listeners + teardown into the session scope.
   * @param binding - session assembly handle.
   * @returns the shell.
   */
  shellFor(binding: SessionBinding): SessionInputShell {
    const existing = this.shells.get(binding.sessionId)
    if (existing !== undefined) return existing
    const { sessionId: id, session, ctx: actx } = binding
    const shell = new SessionInputShell({
      actx,
      inputTriggers: () => this.controller(actx),
      popup: () => this.popup(actx),
      queue: queueReadFaceOf(session),
      defaultSink: (text, attachmentIds, mode, signal) => this.sink(session, text, attachmentIds, mode, signal),
      steerQueue: () => { void this.steerQueue(session, shell) },
      commandAttachments: {
        serialize: async (ids) => {
          const result = await this.conversation().serializeDraftAttachments(ids)
          return result.attachments
        },
        // Asymmetric with serialize on purpose: release settles AFTER the
        // submit RPC, where session teardown may already have unloaded the
        // conversation service (the same tolerance as the scope disposer
        // above); leaked preview URLs then die with the document.
        release: (ids) => {
          const conversation = this.rootCtx.get('conversation') as ConversationAttachmentFace | undefined
          for (const attachmentId of ids) conversation?.releaseDraftAttachment(attachmentId)
        },
        unsupportedNotice: token => this.t('command.attachmentsUnsupported', {
          command: token.trim().replace(/^\//u, ''),
        }),
      },
    })
    this.shells.set(id, shell)
    // The one teardown axis: listeners, shell, and map entries all ride the
    // scope fiber (nothing here outlives the scope).
    actx.effect(() => {
      const offs = [
        actx.on('slash/input-begin-command', req =>
          shell.beginCommand(req.claim, req.span) ? true : undefined),
        actx.on('slash/input-insert-reference', req =>
          shell.insertReference(req.reference, req.span) ? true : undefined),
        actx.on('slash/input-consume-token', req =>
          shell.consumeToken(req.guard) ? true : undefined),
        actx.on('slash/input-insert-text', req =>
          shell.insertText(req.text, req.span, req.continue === true) ? true : undefined),
      ]
      return () => {
        for (const off of offs) off()
        const drafts = shell.dispose()
        this.shells.delete(id)
        const conversation = this.rootCtx.get('conversation') as ConversationAttachmentFace | undefined
        for (const attachmentId of drafts) conversation?.releaseDraftAttachment(attachmentId)
      }
    }, 'conversation.input: session shell')
    return shell
  }

  /**
   * Resident shell by session id (service-face path; the provide channel has
   * normally created it already — this covers direct id-addressed access).
   * @param id - session id.
   * @returns the shell.
   */
  shell(id: SessionId): SessionInputShell {
    const existing = this.shells.get(id)
    if (existing !== undefined) return existing
    const binding = this.sessions().binding(id)
    if (binding === undefined) throw new Error(`conversation.input: session "${id}" resolved no binding`)
    return this.shellFor(binding)
  }

  /**
   * The InputBar-exclusive keyboard command face: the shell
   * satisfies it structurally; package-internal — handed through the
   * composer-bar entry's inject, never across a plugin boundary.
   * @param id - session id.
   * @returns the shell as the keyboard face.
   */
  keyboard(id: SessionId): ComposerKeyboard {
    return this.shell(id)
  }

  /**
   * Query file intake without creating a Session input.
   * @param id - target Session.
   * @returns whether its mounted composer currently accepts files.
   */
  canPickFiles(id: SessionId): boolean {
    return this.shells.get(id)?.canPickFiles() === true
  }

  /**
   * Open the target composer's file dialog under its live intake policy.
   * @param id - target Session.
   */
  pickFiles(id: SessionId): void {
    this.shells.get(id)?.pickFiles()
  }

  /**
   * Resolve the optional slash controller for composer chrome that launches
   * the shared candidate menu without typing a trigger.
   * @param id - session id.
   * @returns the resident controller, or undefined when no trigger provider is installed.
   */
  inputTriggers(id: SessionId): InputTriggerController | undefined {
    const actx = this.sessions().scope(id)
    return actx === undefined ? undefined : this.controller(actx)
  }

  /**
   * Default sink: optimistic clear + prompt. A blank project-free Session is
   * first promoted to a topic-named conversation with its own Host directory,
   * so sibling conversations never share an output folder; every other send
   * keeps the ordinary prompt path, and a failed first prompt is an ordinary
   * prompt failure (banner via promptError, draft restored only while
   * untouched).
   */
  private sink(
    session: SessionFace,
    text: string,
    attachmentIds: readonly DraftAttachmentId[],
    mode: InputSubmitMode,
    signal: AbortSignal,
  ): Promise<SubmitOutcome> {
    if (text === '' && attachmentIds.length === 0) return Promise.resolve({ kind: 'success' })
    const send = (target: SessionFace): Promise<SubmitOutcome> =>
      this.conversation().sendSession(target, text, attachmentIds, mode, signal)
    // The local submission echo must enter the session snapshot synchronously
    // with the send gesture, so only a real promotion pays the async hop.
    if (text.trim() === '' || !isProjectFreeFirstSend(this.sessions().list.getSnapshot().byId[session.sessionId])) {
      return send(session)
    }
    return this.promoteProjectFree(session, text, attachmentIds).then(
      (target) => {
        if (target === undefined) return send(session)
        return send(target).then((outcome) => {
          if (outcome.kind === 'success') this.clearCarriedAttachments(target, attachmentIds)
          return outcome
        })
      },
      () => send(session),
    )
  }

  /**
   * Remove the ids carried into a successor Session once its promoted send is
   * admitted. The successor rail held them only so the switched-to composer
   * kept its attachments during the send; a failed send keeps them there for
   * correction.
   * @param target - the successor Session the send addressed.
   * @param attachmentIds - ids carried into the successor shell.
   */
  private clearCarriedAttachments(target: SessionFace, attachmentIds: readonly DraftAttachmentId[]): void {
    if (attachmentIds.length === 0) return
    const successor = this.shell(target.sessionId)
    for (const id of attachmentIds) successor.removeAttachment(id)
  }

  /**
   * Allocate the topic directory for the first message of a blank project-free
   * conversation and hand the send to the successor Session.
   * @param session - the current blank, cwd-less Session.
   * @param text - the first message text, used as the topic phrase.
   * @param attachmentIds - drafted attachments to carry to the successor.
   * @returns the successor Session, or undefined when this is not a
   *   project-free first send (or promotion could not carry the drafts).
   */
  private async promoteProjectFree(
    session: SessionFace,
    text: string,
    attachmentIds: readonly DraftAttachmentId[],
  ): Promise<SessionFace | undefined> {
    const topic = text.trim()
    if (topic === '') return undefined
    const sessions = this.sessions()
    if (!isProjectFreeFirstSend(sessions.list.getSnapshot().byId[session.sessionId])) return undefined
    const nextId = await sessions.create({ projectFreeName: topic })
    const binding = sessions.binding(nextId)
    if (binding === undefined) return undefined
    if (attachmentIds.length > 0) {
      if (!this.shell(nextId).addAttachments(attachmentIds)) return undefined
      this.conversation().rebindDraftFiles(nextId, attachmentIds)
    }
    sessions.open(nextId)
    return binding.session
  }

  /**
   * Submit every still-pending queued message through QueueDock Steer, in FIFO
   * request order — the same operation as the queue dock's per-row button.
   * An Agent stopping before a command (`session/steer-unavailable`) or a row already
   * claimed by the agent (`session/queue-item-not-found`) converges silently, while a
   * genuine failure surfaces as one composer notice. Repeated triggers
   * (e.g. two rapid empty-draft chords) rely on that `session/queue-item-not-found`
   * convergence: the snapshot may still list a row the host already steered,
   * and the duplicate Steer is a silent no-op.
   * @param session - the addressed host session.
   * @param shell - the resident shell (notice outlet).
   */
  private async steerQueue(session: SessionFace, shell: SessionInputShell): Promise<void> {
    const queued = session.getSnapshot().queue.filter(item => item.placement === 'queued')
    if (queued.length === 0) return
    for (const item of queued) {
      const result = await session.updateQueue(item.id, { kind: 'steer' })
      if (result.ok) continue
      if (result.error.code === 'session/steer-unavailable' || result.error.code === 'session/queue-item-not-found') return
      shell.notify('error', this.t('queue.steerFailed'))
      return
    }
  }

  private controller(actx: Context): InputTriggerController | undefined {
    const inputTriggers = this.rootCtx.get('inputTriggers') as InputTriggerServiceFace | undefined
    return inputTriggers?.sessionOf(actx)
  }

  private popup(actx: Context): PopupDismissFace | undefined {
    const command = this.rootCtx.get('commandUi') as CommandFace | undefined
    return command?.popupFor(actx)
  }

  private sessions(): ISessions {
    const sessions = this.rootCtx.get('sessions')
    if (sessions === undefined) throw new Error('conversation.input: sessions service unavailable')
    return sessions
  }

  private conversation(): ConversationAttachmentFace {
    const conversation = this.rootCtx.get('conversation') as ConversationAttachmentFace | undefined
    if (conversation === undefined) throw new Error('conversation.input: conversation service unavailable')
    return conversation
  }
}
