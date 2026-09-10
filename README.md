# Halyard

English | [中文](README.zh.md)

Halyard is a community fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
by [DeepSeek AI](https://deepseek.com), distributed under the MIT license. The application
displays itself as **DeepSeek Halyard**.

> Halyard is an unofficial fork, not affiliated with, sponsored by, or endorsed by DeepSeek.
> "DeepSeek", "DeepSeek Harness", and the whale mark belong to their owners and are used here
> only to identify the upstream project.

Halyard keeps the upstream **everything-is-a-plugin** architecture (powered by
[Cordis](https://github.com/cordiverse/cordis)) and adds:

- a usage panel: account balance, daily spend estimate, and range-based account usage in the sidebar;
- conversation management: startup settings (new conversation on open, default project), an archive
  manager with restore and permanent delete, and a copyable session-id chip;
- a local macOS desktop app that runs this checkout directly (`apps/desktop-live`);
- fixes on top of upstream `0.1.5-rc.2`, including a stable desktop port so browser-local
  preferences survive restarts.

Closed turns fold through the product's own transcript compaction. For Codex-style folding of
consecutive tool calls inside a turn, install the third-party
[dsh-fold](https://github.com/Yancey2023/dsh-fold) client plugin into a profile — see the Credits section below.

## Developer preview

Halyard tracks an upstream developer preview that iterates rapidly.
**THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the upstream [safety notice](SAFETY.md) before running the project.

## Run

Requirements: Node.js `^22.19 || >=24` and pnpm.

```sh
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm dsh web` serves the Web UI on `http://127.0.0.1:3080` by default; pass `--no-open` to skip
opening a browser or `--port <n>` to change the port. Real model runs read `DEEPSEEK_API_KEY` from the
environment or a root `.env` file.

### Desktop app (macOS)

```sh
node apps/desktop-live/scripts/install-macos.mjs
```

The script builds a `DeepSeek Halyard.app` that spawns `pnpm dsh web` from this checkout and opens
the authenticated URL.

## Documentation

- Upstream documentation: <https://deepseek-harness.github.io/deepseek-harness/>
- Repository guides: [docs/development.md](docs/development.md), [docs/architecture.md](docs/architecture.md)
- For agents: [AGENTS.md](AGENTS.md)

## Credits

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) by DeepSeek AI — upstream
  project and the whale mark.
- [dsh-fold](https://github.com/Yancey2023/dsh-fold) by Yancey2023 (MIT) — optional third-party
  client plugin that folds consecutive tool calls; it is installed into a profile with
  `dsh plugin --profile web add github:Yancey2023/dsh-fold` and is not bundled here. Thanks to its
  author for the standalone folding UI.
- [Cordis](https://github.com/cordiverse/cordis) and the vendored framework libraries
  (see [vendor/README.md](vendor/README.md)).

## License

[MIT](LICENSE), Copyright (c) 2026 DeepSeek, with modifications by the Halyard contributors
(see [NOTICE](NOTICE)).

Third-party dependencies and their licenses are disclosed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
