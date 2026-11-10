# @miragon/dmn-modeler

[![npm](https://img.shields.io/npm/v/@miragon/dmn-modeler)](https://www.npmjs.com/package/@miragon/dmn-modeler)
[![License: Apache 2.0](https://img.shields.io/github/license/Miragon/bpmn-modeler)](https://github.com/Miragon/bpmn-modeler/blob/main/LICENSE)

**Put a DMN modeler with decision simulation into your own web app with one call.**

`@miragon/dmn-modeler` is the DMN modeler behind the Miragon BPMN Modeler for VS Code, the desktop app and Orca, built on [dmn-js](https://github.com/bpmn-io/dmn-js). To model DMN yourself instead, install one of those [editors](https://github.com/Miragon/bpmn-modeler#install).

## What you get

- **One call, a full modeler.** `createModeler(container, options)` brings the decision requirements diagram, decision tables, literal expressions and a properties panel.
- **Decisions you can try.** A simulation module evaluates a decision table in place.
- **Light and dark per instance.** One stylesheet holds both looks, and the theme follows `prefers-color-scheme` unless you pin it.
- **12 languages.** Set the locale up front or switch it live with `setLocale`; it applies to the whole page.

## Install

```sh
npm install @miragon/dmn-modeler
```

The dmn-js stack ships as regular dependencies, so this one install is all you need. With Yarn 2 or later and the `node-modules` linker, pin `diagram-js` as the [caveats](https://miragon.github.io/bpmn-modeler/embed/dmn-modeler#caveats) describe.

## Get started

```ts
import { createModeler } from "@miragon/dmn-modeler";
import "@miragon/dmn-modeler/styles.css";

const modeler = await createModeler(document.querySelector("#canvas")!, {
    propertiesPanel: { parent: document.querySelector("#properties")! },
});

const dmnXml = await (await fetch("decision.dmn")).text();
await modeler.loadDiagram(dmnXml);
const xml = await modeler.exportDiagram();
```

`propertiesPanel` is required, and `#canvas` needs a height; there is no empty starter diagram, so load existing DMN XML. The [reference](https://miragon.github.io/bpmn-modeler/embed/dmn-modeler) covers theming, locale, views, the escape hatch and caveats.

## Help and feedback

- **Documentation:** the [`@miragon/dmn-modeler` reference](https://miragon.github.io/bpmn-modeler/embed/dmn-modeler).
- **Bugs and ideas:** [open an issue](https://github.com/Miragon/bpmn-modeler/issues).
- **Changes:** see the [changelog](https://github.com/Miragon/bpmn-modeler/blob/main/packages/dmn-modeler/CHANGELOG.md).

## Contributing

How to build, test and change the package is in [CONTRIBUTING.md](https://github.com/Miragon/bpmn-modeler/blob/main/CONTRIBUTING.md).

## License

[Apache License 2.0](https://github.com/Miragon/bpmn-modeler/blob/main/packages/dmn-modeler/LICENSE). Made by [Miragon](https://www.miragon.io).

The package depends on third-party software (dmn-js, diagram-js, dmn-js-properties-panel and the bpmn.io ecosystem); their licenses apply, and dmn-js renders the bpmn.io watermark, which you must keep visible unless you hold a commercial [bpmn.io license](https://bpmn.io/license/).
