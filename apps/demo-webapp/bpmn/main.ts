import { bootstrap } from "@miragon/bpmn-modeler-webview";
import { mountDemoHeader, DemoGrayoutModule, modelHref, resolveReference } from "../src";
import { BpmnDemoHost } from "./demoHost";

mountDemoHeader("bpmn");
// The demo supplies only the model-navigation capability; codeLink and scripting
// are omitted, so their context-pad entries / lock UI genuinely never render
// (AC3 — a host-less consumer no longer gets dead buttons).
bootstrap(new BpmnDemoHost(), {
    extraModules: [DemoGrayoutModule],
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
