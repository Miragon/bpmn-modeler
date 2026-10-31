import {
    asProtocolMessage,
    type Command,
    ElementTemplateFileQuery,
    type HostApi,
    HostApiImpl,
    LanguageQuery,
    MockHostApi,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import c7Samples from "../__fixtures__/c7-samples.json";
import c8Samples from "../__fixtures__/c8-samples.json";

declare const process: { env: { NODE_ENV: string } };

type MessageType = Command | Query;

export function getTemplateEditorHostApi(): HostApi<unknown, MessageType> {
    if (process.env.NODE_ENV === "development") {
        return new MockTemplateEditorHost();
    }
    return new HostApiImpl<unknown, MessageType>();
}

// Files for the editor's other states, picked with `?file=`.
const FILES: Readonly<Record<string, string>> = {
    empty: "",
    noschema: `${JSON.stringify({ name: "Plain", id: "plain", appliesTo: ["bpmn:ServiceTask"], properties: [] }, null, 2)}\n`,
    broken: '{\n  "name": "Broken",\n',
};

/**
 * Serves the C8 sample templates, the C7 ones for `?engine=c7`, or one of
 * {@link FILES} for `?file=`. `?lang=de` switches the language once the
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
        const samples = params.get("engine") === "c7" ? c7Samples : c8Samples;
        const file = FILES[params.get("file") ?? ""] ?? `${JSON.stringify(samples, null, 2)}\n`;
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
