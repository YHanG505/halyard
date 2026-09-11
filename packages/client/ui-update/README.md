---
description: "Packaged desktop app update prompt: a sidebar footer action over the shell's release-update bridge; for users and maintainers of the desktop app."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-update

## Summary

This package renders the update prompt of the packaged DeepSeek Halyard desktop app: a sidebar footer action that appears when the Electron shell's GitHub Releases check finds a newer version, and that drives the shell's download, bundle replacement, and relaunch. It renders nothing in a plain browser or when no update is available. The shell owns every side effect; this package is the prompt surface.

## Use this package

Mount this plugin alongside the runtime. In the packaged desktop app, the preload bridge exposes `globalThis.dshDesktop.updates`; the action subscribes to published state, asks for one check on mount, and shows a primary button labelled with the target version. A click calls `install()`; the button disables while the shell installs and relabels itself through the `installing` and `ready` phases. An install failure shows a short manual-download hint.

## Model Experience

None. The action is browser chrome; it contributes no prompt text, tool schema, or session event, and never reaches the model.

## Known Limitations and Deferred Work

- The bridge is desktop-only: browsers and the source-run shell render nothing.
- `ready`, `error`, and `idle` messages from the shell are not expanded into an inline detail view; the action shows the localized label only.
