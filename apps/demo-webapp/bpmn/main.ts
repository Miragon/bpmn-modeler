import { bootstrap } from "@miragon/bpmn-modeler-webview";
import { mountDemoHeader, DemoGrayoutModule, modelHref, resolveReference } from "../src";
import { BpmnDemoHost } from "./demoHost";

mountDemoHeader("bpmn");
// The demo supplies only the model-navigation capability; codeLink and scripting
// are omitted, so their context-pad entries / lock UI genuinely never render — a
// host-less consumer gets no dead buttons.
//
// `linting: {}` opts into in-page linting with the engine-aware default config —
// the host-less proof that the webview lints itself. onLintResults logs each run
// so the browser console shows the rule-keyed output + any rules the bundled
// resolver could not cover.
bootstrap(new BpmnDemoHost(), {
    extraModules: [DemoGrayoutModule],
    linting: {},
    // Plain-browser demo: use the native browser clipboard. The stub
    // host cannot serve a real clipboard, so the protocol-bridge default would
    // leave paste dead in the production build.
    clipboard: "native",
    onLintResults: ({ results, unresolved }) => {
        console.debug("[demo] in-page lint", { results, unresolved });
    },
    capabilities: {
        modelNavigation: {
            openReference: ({ id, kind }) => {
                const target = resolveReference(id, kind);
                if (target) {
                    window.location.href = modelHref(target);
                }
            },
        },
    },
});
