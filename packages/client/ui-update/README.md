---
description: "Packaged desktop app update prompt: a sidebar footer action over the shell's release-update bridge; for users and maintainers of the desktop app."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-update

English | [中文](README.zh.md)

## Summary

This package renders the update prompt of the packaged DeepSeek Halyard desktop app: a sidebar footer action that appears when the Electron shell finds a newer GitHub release, and that drives the shell's download, bundle replacement, and relaunch. It renders nothing in a plain browser or when no update is available. The shell owns every side effect; this package is the prompt surface.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside the runtime. In the packaged desktop app the preload bridge exposes `globalThis.dshDesktop.updates`; the action subscribes to published state, asks for one check on mount, and shows a primary button labelled with the target version. A click calls `install()`; the button disables while the shell installs and relabels through the `installing` and `ready` phases. An install failure shows a short manual-download hint.

<a id="model-experience"></a>
## Model Experience

None, as this browser-side prompt renders shell-published release state and registers no prompt, schema, or session event.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Desktop-only bridge** — browsers and the source-run shell render nothing.
- **No inline detail view** — `ready`, `error`, and `idle` messages from the shell are shown only as the localized action label.

<a id="dev-note"></a>
### Dev Note

The action reads the shell bridge structurally (`globalThis.dshDesktop.updates`); it imports nothing from the desktop application. Client tests mount it with a fake bridge and assert visibility, install clicks, and phase copy.
