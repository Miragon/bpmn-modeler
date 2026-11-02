import { createTemplatePreview } from "@miragon/bpmn-modeler";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    applyPageThemeScope,
    type Command,
    createHostThemeAdapter,
    GetElementTemplateFileCommand,
    type HostApi,
    LogErrorCommand,
    type MessageOfType,
    resolveHostThemeKind,
} from "@miragon/bpmn-modeler-shared";

import { createHostMessageRouter, type HostMessage } from "../session/messageRouter";
import { mountPreviewView } from "./previewView";
import { readTemplateFile, type TemplateFileState } from "./templateFile";

type PreviewHost = Pick<HostApi<unknown, Command>, "postMessage">;

type TemplatePreviewHostMessages = {
    ElementTemplateFileQuery: MessageOfType<"ElementTemplateFileQuery">;
    LanguageQuery: MessageOfType<"LanguageQuery">;
};

// Long enough to skip the half-typed states between keystrokes.
const EDIT_DEBOUNCE_MS = 300;

/** Resolves to a disposer that stops listening to the host. */
export async function bootstrapTemplatePreview(host: PreviewHost): Promise<() => void> {
    i18n.extend(i18nExtras);
    const root = document.getElementById("app");
    if (!root) {
        throw new Error("Template preview: missing #app");
    }
    const view = mountPreviewView(root);
    const preview = await createTemplatePreview(view.panel, { theme: resolveHostThemeKind() });
    const themeAdapter = createHostThemeAdapter((kind) => {
        applyPageThemeScope("data-bpmn-theme", kind);
        preview.setTheme(kind);
    });
    themeAdapter.setMode("automatic");

    let content: string | undefined;
    let selected: string | undefined;
    let pendingUpdate: ReturnType<typeof setTimeout> | undefined;

    async function update(): Promise<void> {
        const state = readTemplateFile(content ?? "", selected);
        if (state.kind === "template" || state.kind === "unknownEngine") {
            selected = state.selected;
            view.showChoices(state.choices, state.selected);
        }
        if (state.kind !== "template") {
            // Like an unparseable edit, every unrenderable state keeps the last preview.
            view.showMessages(messagesFor(state));
            return;
        }
        view.showEngine(state.engine);
        const outcome = await preview.show(state.template, state.engine);
        view.showMessages(
            outcome.errors.length > 0
                ? [i18n.translate("The template is invalid:"), ...outcome.errors]
                : [],
        );
    }

    function scheduleUpdate(immediately: boolean): void {
        clearTimeout(pendingUpdate);
        pendingUpdate = setTimeout(
            () =>
                void update().catch((error: unknown) =>
                    host.postMessage(
                        new LogErrorCommand(`Template preview failed: ${String(error)}`),
                    ),
                ),
            immediately ? 0 : EDIT_DEBOUNCE_MS,
        );
    }

    view.onSelect((key) => {
        selected = key;
        scheduleUpdate(true);
    });

    const route = createHostMessageRouter<TemplatePreviewHostMessages>(host, {
        ElementTemplateFileQuery: (query) => {
            if (query.locale) {
                preview.setLocale(query.locale);
            }
            const firstContent = content === undefined;
            content = query.content;
            scheduleUpdate(firstContent);
        },
        LanguageQuery: (query) => preview.setLocale(query.locale),
    });
    const onMessage = (event: MessageEvent<HostMessage>) => void route(event.data);
    window.addEventListener("message", onMessage);
    host.postMessage(new GetElementTemplateFileCommand());
    return () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(pendingUpdate);
        themeAdapter.dispose();
        preview.destroy();
    };
}

function messagesFor(state: Exclude<TemplateFileState, { kind: "template" }>): string[] {
    switch (state.kind) {
        case "empty":
            return [i18n.translate("Add an element template to this file to preview it.")];
        case "invalidJson":
            return [
                i18n.translate("The JSON is invalid: {message}", { message: state.message }),
                i18n.translate("The preview shows the last valid template."),
            ];
        case "notATemplate":
            return [i18n.translate("This file does not contain an element template.")];
        case "unknownEngine":
            return [i18n.translate('Add a "$schema" to choose between Camunda 7 and Camunda 8.')];
    }
}
