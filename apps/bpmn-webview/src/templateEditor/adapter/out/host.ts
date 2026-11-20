import {
    asProtocolMessage,
    type Command,
    ElementTemplateFileQuery,
    HostApiImpl,
    LanguageQuery,
    MockHostApi,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { type Engine, isEngine } from "@miragon/bpmn-modeler-types";

import c7Samples from "../../../__fixtures__/c7-samples.json";
import c8Samples from "../../../__fixtures__/c8-samples.json";
import { mockTemplateFile } from "../../../__fixtures__/mock-template-files";
import type { TemplateEditorHost } from "../../port/templateEditorHost";

declare const process: { env: { NODE_ENV: string } };

type MessageType = Command | Query;

const SAMPLES: Record<Engine, unknown> = { c7: c7Samples, c8: c8Samples };

export function getTemplateEditorHostApi(): TemplateEditorHost {
    if (process.env.NODE_ENV === "development") {
        return new MockTemplateEditorHost();
    }
    return new HostApiImpl<unknown, MessageType>();
}

/**
 * Serves the C8 sample templates, the C7 ones for `?engine=c7`, or the
 * {@link mockTemplateFile} `?file=` names. `?lang=de` switches the language once the
 * first template is shown.
 */
class MockTemplateEditorHost extends MockHostApi<unknown, MessageType> {
    override postMessage(message: MessageType): void {
        const command = asProtocolMessage(message);
        if (command.type !== "GetElementTemplateFileCommand") {
            console.debug("[dev] template editor sent", command);
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const engine = params.get("engine");
        const samples = SAMPLES[isEngine(engine) ? engine : "c8"];
        const file = mockTemplateFile(params.get("file") ?? "") ?? `${JSON.stringify(samples, null, 2)}\n`;
        dispatch(new ElementTemplateFileQuery(file));
        const lang = params.get("lang");
        if (lang) {
            dispatch(new LanguageQuery(lang));
        }
    }
}

function dispatch(message: MessageType): void {
    window.dispatchEvent(new MessageEvent("message", { data: message }));
}
