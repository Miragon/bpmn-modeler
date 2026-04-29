<div id="top"></div>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<br />
<div align="center">
    <a href="#">
        <img src="https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/miragon-logo.png" alt="Miragon" height="160">
    </a>
    <h3>BPMN, where your work already happens.</h3>
    <p>A growing family of BPMN/DMN tools built around a shared modeler core — in VS Code, on the desktop, and (soon) talking to your AI assistant.</p>
    <p>
        <a href="https://miragon.github.io/bpmn-modeler/">Documentation</a>
        ·
        <a href="https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler">Install on Marketplace</a>
        ·
        <a href="https://github.com/Miragon/bpmn-modeler/issues">Issues</a>
    </p>
</div>

---

## Why we built this

Process diagrams are code. They live in your repo, get reviewed in pull
requests, and ship with the rest of your software. But for years the only
way to edit them was a separate desktop modeler — context switch, save,
re-open in your IDE, commit, repeat.

We wanted to skip the round trip. **Open a `.bpmn` file. Model. Commit.
Done.** Same editor, same git workflow, same diff in code review.

![BPMN VS Code Modeler Preview](https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/modeler-preview.png)

That first idea — *bring BPMN modeling to where engineers already are* —
turned into the VS Code modeler you see above. From there, the same core
quietly grew into more places where process work actually happens:

- **In VS Code**, as the public extension — the original product.
- **On the desktop**, as a standalone Theia/Electron app for users and
  organisations not on VS Code, with the exact same modeling surface.
- **And next: AI-assisted BPMN tooling** — bringing the same modeling
  context into your AI assistant. *Stay tuned.* ✨

Different surfaces, one modeling engine, one repo.

## What you get

- **Full BPMN 2.0 + DMN modeling** for **Camunda 7** and **Camunda 8**
  (plus compatible forks like **Operaton** and **CIB7**) — engine-aware
  properties, no profile switching ceremony.
- **Element templates by convention** — drop them in `.camunda/element-templates/`
  next to your BPMN file, the modeler picks them up. No project config required.
- **Deploy from the editor** — a sidebar that pushes your diagram to C7 or
  C8 (no auth, Basic, or OAuth2 Client Credentials) and starts a process
  instance with payload files discovered from `.camunda/payloads/`.
- **Visual BPMN diff** — open two `.bpmn` files side by side, see what
  changed at the element level (added · removed · changed · moved) with
  synchronized pan/zoom. Great in code review.
- **Speaks your language** — UI translated into 9 locales: English,
  Deutsch, Español, Français, Nederlands, Português (Brasil), Русский,
  简体中文, 繁體中文.
- **Built on [bpmn.io](https://bpmn.io/)** — the toolkit the official
  Camunda Modeler is based on. You get the same modeling foundation, just
  embedded where you already work.

### Try it in 30 seconds

> Install **[Camunda Modeler by Miragon][marketplace-url]** from the VS Code
> Marketplace, open any `.bpmn` or `.dmn` file — the modeler opens
> automatically as a custom editor. That's it.

For settings, commands, and the full feature tour see
**[`apps/modeler-plugin/README.md`](apps/modeler-plugin/README.md)** — the
same page that's published as the Marketplace listing.

## Modules in this repo

This is a monorepo. Around the modeler core we ship multiple delivery
surfaces; each one has its own README with its own pitch.

| Module | What it is | Status |
|---|---|---|
| [`apps/modeler-plugin`](apps/modeler-plugin/README.md) | The VS Code extension — the public BPMN/DMN modeler. | Published on the [Marketplace][marketplace-url] |
| [`apps/standalone`](apps/standalone/README.md) | Theia/Electron desktop shell wrapping the same modeler — same features, no VS Code required. | Build-from-source, unreleased |
| `apps/bpmn-iq-plugin` | Separate VS Code extension that pushes your BPMN landscape to an LLM over MCP — see [bpmn-iq](https://github.com/Miragon/bpmn-iq). | Landing in [PR #943](https://github.com/Miragon/bpmn-modeler/pull/943) |
| [`apps/bpmn-webview`](apps/bpmn-webview/README.md) | BPMN canvas webview embedded in the extension host. | Internal |
| [`apps/dmn-webview`](apps/dmn-webview/README.md) | DMN canvas webview embedded in the extension host. | Internal |
| [`apps/deployment-webview`](apps/deployment-webview/README.md) | Deployment sidebar webview. | Internal |
| [`libs/shared`](libs/shared/README.md) | Shared message types and webview utilities. | Internal |

> Internal modules are not published separately — they are bundled into the
> distributables above.

## Contributing

We love PRs. Whether you fix a typo or land a feature, the path is the same:

```bash
corepack enable
corepack yarn install
corepack yarn build      # build everything
corepack yarn watch      # F5 in VS Code → "Run modeler-plugin"
```

> Working on a single workspace only? `yarn workspaces focus <name>` installs just
> that tree and skips the rest. See [Workspace dependencies](https://miragon.github.io/bpmn-modeler/vscode/contributing/development#workspace-dependencies)
> for the focus targets per pipeline.

For the full setup, PR flow, and commit conventions see
**[`CONTRIBUTING.md`](CONTRIBUTING.md)**. For architecture, build system,
and contributor walkthroughs see **[`docs/`](docs/)** (also published at
<https://miragon.github.io/bpmn-modeler/>).

## Support

Questions, ideas, or commercial support? Reach out at
[info@miragon.io](mailto:info@miragon.io) — or open an
[issue](https://github.com/Miragon/bpmn-modeler/issues).

## License

Distributed under the [Apache License 2.0](LICENSE).

<!-- MARKDOWN LINKS & IMAGES -->

[contributors-shield]: https://img.shields.io/github/contributors/Miragon/bpmn-modeler.svg?style=for-the-badge
[contributors-url]: https://github.com/Miragon/bpmn-modeler/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Miragon/bpmn-modeler.svg?style=for-the-badge
[forks-url]: https://github.com/Miragon/bpmn-modeler/network/members
[stars-shield]: https://img.shields.io/github/stars/Miragon/bpmn-modeler.svg?style=for-the-badge
[stars-url]: https://github.com/Miragon/bpmn-modeler/stargazers
[issues-shield]: https://img.shields.io/github/issues/Miragon/bpmn-modeler.svg?style=for-the-badge
[issues-url]: https://github.com/Miragon/bpmn-modeler/issues
[license-shield]: https://img.shields.io/github/license/Miragon/bpmn-modeler.svg?style=for-the-badge
[license-url]: https://github.com/Miragon/bpmn-modeler/blob/main/LICENSE
[marketplace-url]: https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler
