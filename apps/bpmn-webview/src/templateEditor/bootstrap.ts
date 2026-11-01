import { createTemplatePreview } from "@miragon/bpmn-modeler";
import {
    applyTemplateEdits,
    catalogFor,
    createTemplateBuilder,
    type Diagnostic,
    newTemplateText,
    ruleDiagnostics,
    schemaDiagnostics,
    type TemplateBuilderState,
    type TemplateEdit,
    withSchema,
} from "@miragon/bpmn-modeler-element-template-builder";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    applyPageThemeScope,
    type Command,
    createHostThemeAdapter,
    GetElementTemplateFileCommand,
    type HostApi,
    initResizer,
    LogErrorCommand,
    type MessageOfType,
    resolveHostThemeKind,
} from "@miragon/bpmn-modeler-shared";

import { createHostMessageRouter, type HostMessage } from "../session/messageRouter";
import { TemplateDocumentSession, type TextOrigin } from "./documentSession";
import { type EditorMain, mountEditorView } from "./editorView";
import { readTemplateFile, type TemplateFileState } from "./templateFile";

type EditorHost = Pick<HostApi<unknown, Command>, "postMessage">;
type Translate = (template: string, replacements?: Record<string, string>) => string;

type TemplateEditorHostMessages = {
    ElementTemplateFileQuery: MessageOfType<"ElementTemplateFileQuery">;
    LanguageQuery: MessageOfType<"LanguageQuery">;
    FlushDocumentQuery: MessageOfType<"FlushDocumentQuery">;
    ReleaseDocumentFlushQuery: MessageOfType<"ReleaseDocumentFlushQuery">;
};

// Host edits arrive already debounced; this skips the half-typed states of the page's own.
const EDIT_DEBOUNCE_MS = 300;

// Below this the builder needs the room, e.g. beside the JSON editor; the toggle opens the preview.
const NARROW_EDITOR_WIDTH = 640;

export interface TemplateEditorOptions {
    /** Sees every text the page translates; the dev page records them for the i18n overlay. */
    onTranslate?: (template: string) => void;
}

/** Resolves to a disposer that stops listening to the host. */
export async function bootstrapTemplateEditor(
    host: EditorHost,
    { onTranslate }: TemplateEditorOptions = {},
): Promise<() => void> {
    const translate: Translate = (template, replacements) => {
        onTranslate?.(template);
        return i18n.translate(template, replacements);
    };
    i18n.extend(i18nExtras);
    const root = document.getElementById("app");
    if (!root) {
        throw new Error("Template editor: missing #app");
    }
    const view = mountEditorView(root, translate);
    const previewPane = initResizer({
        getToggleLabel: (state) =>
            translate(state === "collapsed" ? "Show preview" : "Hide preview"),
        onLabelChange: (apply) => i18n.onChange(apply),
    });
    if (window.innerWidth < NARROW_EDITOR_WIDTH) {
        previewPane.setVisible(false);
    }
    const preview = await createTemplatePreview(view.previewPanel, {
        theme: resolveHostThemeKind(),
    });
    const themeAdapter = createHostThemeAdapter((kind) => {
        applyPageThemeScope("data-bpmn-theme", kind);
        preview.setTheme(kind);
    });
    themeAdapter.setMode("automatic");

    let state: TemplateFileState = { kind: "empty" };
    let selected: string | undefined;
    let diagnostics: Diagnostic[] = [];
    // While the JSON is broken, the builder keeps showing this, read-only.
    let lastShown: TemplateBuilderState | undefined;
    let pendingCheck: ReturnType<typeof setTimeout> | undefined;

    const session = new TemplateDocumentSession(host, (_text, origin) => refresh(origin));
    const stopRelabelling = i18n.onChange(() => {
        view.relabel();
        // The first file brings the language just before its text; it renders itself.
        if (session.hasDocument) {
            refresh("select");
        }
    });
    const builder = createTemplateBuilder(view.builderRoot, {
        translate,
        onEdit: (edits: TemplateEdit[]) => {
            if (state.kind === "template") {
                session.edit(applyTemplateEdits(session.text, state.path, edits));
            }
        },
    });

    function showBuilder(next: TemplateBuilderState): void {
        lastShown = next;
        builder.show(next);
    }

    /** Shows the text at once; the preview and the validation follow when editing pauses. */
    function refresh(origin: TextOrigin | "select"): void {
        state = readTemplateFile(session.text, selected);
        if (state.kind === "template" || state.kind === "unknownEngine") {
            selected = state.selected;
            view.showChoices(state.choices, state.selected);
        } else {
            view.showChoices([], undefined);
        }
        const main = mainFor(state, lastShown !== undefined);
        view.showMain(main);
        view.showPreview(main === "builder");
        if (state.kind !== "template") {
            view.showEngine(undefined);
            view.showMessages(messagesFor(state, translate));
            if (lastShown) {
                builder.show({ ...lastShown, editable: false });
            }
            return;
        }
        view.showEngine(state.engine);
        showBuilder({
            template: state.template,
            engine: state.engine,
            editable: true,
            diagnostics,
        });
        clearTimeout(pendingCheck);
        pendingCheck = setTimeout(
            () =>
                void check().catch((error: unknown) =>
                    host.postMessage(
                        new LogErrorCommand(`Template preview failed: ${String(error)}`),
                    ),
                ),
            origin === "edit" ? EDIT_DEBOUNCE_MS : 0,
        );
    }

    async function check(): Promise<void> {
        if (state.kind !== "template") {
            return;
        }
        const { template, engine } = state;
        diagnostics = [
            ...schemaDiagnostics(engine, template),
            ...ruleDiagnostics(template, catalogFor(engine)),
        ];
        showBuilder({ template, engine, editable: true, diagnostics });
        const outcome = await preview.show(template, engine);
        if (outcome.rendered) {
            view.showMessages([]);
        } else if (diagnostics.length > 0) {
            view.showMessages([translate("The preview shows the last template without errors.")]);
        } else {
            view.showMessages(outcome.errors);
        }
    }

    view.onSelect((key) => {
        selected = key;
        refresh("select");
    });
    view.onCreate((engine, elementType, name) => {
        session.edit(newTemplateText(engine, { name, elementType }));
    });
    view.onChooseEngine((engine) => {
        if (state.kind === "unknownEngine") {
            session.edit(withSchema(session.text, state.path, engine));
        }
    });

    const route = createHostMessageRouter<TemplateEditorHostMessages>(host, {
        ElementTemplateFileQuery: (query) => {
            if (query.locale) {
                preview.setLocale(query.locale);
            }
            return session.receive(query);
        },
        LanguageQuery: (query) => preview.setLocale(query.locale),
        FlushDocumentQuery: (query) => session.respondToFlush(query),
        ReleaseDocumentFlushQuery: (query) => session.respondToFlush(query),
    });
    const onMessage = (event: MessageEvent<HostMessage>) => void route(event.data);
    // A hidden webview is destroyed, so an edit still waiting must go out now.
    const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
            void session.flushPendingEdit();
        }
    };
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    host.postMessage(new GetElementTemplateFileCommand());
    return () => {
        stopRelabelling();
        window.removeEventListener("message", onMessage);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        session.dispose();
        clearTimeout(pendingCheck);
        themeAdapter.dispose();
        previewPane.dispose();
        builder.destroy();
        preview.destroy();
    };
}

/** While the JSON is broken, the builder stays on the last template it showed, if any. */
function mainFor(state: TemplateFileState, shownBefore: boolean): EditorMain {
    switch (state.kind) {
        case "empty":
            return "wizard";
        case "unknownEngine":
            return "engineChoice";
        case "template":
            return "builder";
        default:
            return shownBefore ? "builder" : "placeholder";
    }
}

function messagesFor(
    state: Exclude<TemplateFileState, { kind: "template" }>,
    translate: Translate,
): string[] {
    switch (state.kind) {
        case "empty":
            return [];
        case "invalidJson":
            return [
                translate("The JSON is invalid: {message}", { message: state.message }),
                translate("Fix it in the JSON editor; until then the builder is read-only."),
            ];
        case "notATemplate":
            return [translate("This file does not contain an element template.")];
        case "unknownEngine":
            return [translate('The template has no "$schema" that names its engine.')];
    }
}
