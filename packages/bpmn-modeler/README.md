# @miragon/bpmn-modeler

[![npm](https://img.shields.io/npm/v/@miragon/bpmn-modeler)](https://www.npmjs.com/package/@miragon/bpmn-modeler)
[![License: Apache 2.0](https://img.shields.io/github/license/Miragon/bpmn-modeler)](https://github.com/Miragon/bpmn-modeler/blob/main/LICENSE)

**Put a Camunda-ready BPMN modeler into your own web app with one call.**

`@miragon/bpmn-modeler` is the modeler behind the Miragon BPMN Modeler for VS Code, IntelliJ, the desktop app and Orca, built on [bpmn-js](https://github.com/bpmn-io/bpmn-js) for Camunda 7 and Camunda 8. To model BPMN yourself instead, install one of those [editors](https://github.com/Miragon/bpmn-modeler#install).

## What you get

- **One call, a full modeler.** `createModeler(container, options)` brings the properties panel, clipboard, theming and the Camunda element-template stack.
- **Only what you use in your bundle.** Optional parts are separate subpaths: `/lint` (off until you pass it in), `/viewer`, `/design`, `/mode`, `/diff` and `/plugins`, each with its own stylesheet where it needs one.
- **Your host, your features.** Code links, model navigation, inline scripting and definition search appear only when you pass a capability port for them.
- **Light and dark per instance.** One stylesheet holds both looks, and the theme follows `prefers-color-scheme` unless you pin it.

## Install

```sh
npm install @miragon/bpmn-modeler
```

The bpmn-io stack ships as regular dependencies, so this one install is all you need. With Yarn 2 or later and the `node-modules` linker, pin `diagram-js`, `bpmn-moddle` and `preact` as the [caveats](https://miragon.github.io/bpmn-modeler/embed/bpmn-modeler#caveats) describe; Yarn Plug'n'Play is not supported yet.

## Get started

```ts
import { createModeler } from "@miragon/bpmn-modeler";
import "@miragon/bpmn-modeler/styles.css";

const modeler = await createModeler(document.querySelector("#canvas")!, {
    engine: "c8",
    propertiesPanel: { parent: document.querySelector("#properties")! },
});

await modeler.newDiagram();
const xml = await modeler.exportDiagram();
```

`engine` (`"c7"` or `"c8"`) and `propertiesPanel` are required, and `#canvas` needs a height. The [reference](https://miragon.github.io/bpmn-modeler/embed/bpmn-modeler) covers every option, the capability ports, linting tiers, the viewer, design mode, mode session, diff, plugins and caveats.

## Help and feedback

- **Documentation:** the [`@miragon/bpmn-modeler` reference](https://miragon.github.io/bpmn-modeler/embed/bpmn-modeler).
- **Bugs and ideas:** [open an issue](https://github.com/Miragon/bpmn-modeler/issues).
- **Changes:** see the [changelog](https://github.com/Miragon/bpmn-modeler/blob/main/packages/bpmn-modeler/CHANGELOG.md).

## Contributing

How to build, test and change the package is in [CONTRIBUTING.md](https://github.com/Miragon/bpmn-modeler/blob/main/CONTRIBUTING.md).

## License

[Apache License 2.0](https://github.com/Miragon/bpmn-modeler/blob/main/packages/bpmn-modeler/LICENSE). Made by [Miragon](https://www.miragon.io).

The package bundles and depends on third-party software (bpmn-js, diagram-js and the bpmn.io ecosystem, bpmnlint and others); their licenses apply, and bpmn-js renders the bpmn.io watermark, which you must keep visible unless you hold a commercial [bpmn.io license](https://bpmn.io/license/). The `/design` subpath contains a modified fork of [bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel) (MIT); see [THIRD_PARTY_NOTICES](https://github.com/Miragon/bpmn-modeler/blob/main/packages/bpmn-modeler/THIRD_PARTY_NOTICES).
