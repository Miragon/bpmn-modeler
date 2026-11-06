import { createTemplatePreview } from "@miragon/bpmn-modeler";
import {
    applyTemplateEdits,
    builderStateOf,
    choicesOf,
    createTemplateBuilder,
    EMPTY_PAGE,
    engineOf,
    mainOf,
    messagesOf,
    newTemplateText,
    type PageMessage,
    pageForSelection,
    pageForText,
    pageWithDiagnostics,
    pageWithPreview,
    pageWithRefusal,
    type TemplateBuilderHandle,
    type TemplateEdit,
    type TemplateEditResult,
    templateIdentity,
    type TextOrigin,
    withSchema,
} from "@miragon/bpmn-modeler-element-template-builder";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    applyPageThemeScope,
    createHostThemeAdapter,
    GetElementTemplateFileCommand,
    type HostApi,
    initResizer,
    LogErrorCommand,
    type MessageOfType,
    resolveHostThemeKind,
    type TemplateEditorCommand,
} from "@miragon/bpmn-modeler-shared";

import { createHostMessageRouter, type HostMessage } from "../../adapter/in/messageRouter";
import { TemplateDocumentSession } from "../service/documentSession";
import { mountEditorView } from "../adapter/in/editorView";
import { fitPreview, INITIAL_PREVIEW_FIT } from "../domain/previewFit";

type EditorHost = Pick<HostApi<unknown, TemplateEditorCommand>, "postMessage">;
type Translate = (template: string, replacements?: Record<string, string>) => string;

type TemplateEditorHostMessages = {
    ElementTemplateFileQuery: MessageOfType<"ElementTemplateFileQuery">;
    LanguageQuery: MessageOfType<"LanguageQuery">;
    FlushDocumentQuery: MessageOfType<"FlushDocumentQuery">;
    ReleaseDocumentFlushQuery: MessageOfType<"ReleaseDocumentFlushQuery">;
};

// Host edits arrive already debounced; this skips the half-typed states of the page's own.
const EDIT_DEBOUNCE_MS = 300;

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
    // A host without the builder, such as IntelliJ, asks for the preview alone.
    const previewOnly = root.dataset.view === "preview";
    const view = mountEditorView(root, translate, { previewOnly });
    const previewPane = previewOnly
        ? undefined
        : initResizer({
              getToggleLabel: (state) =>
                  translate(state === "collapsed" ? "Show preview" : "Hide preview"),
              onLabelChange: (apply) => i18n.onChange(apply),
          });
    let previewFit = INITIAL_PREVIEW_FIT;
    const fitToWidth = () => {
        if (previewPane) {
            const { fit, show } = fitPreview(
                previewFit,
                window.innerWidth,
                previewPane.isVisible(),
            );
            previewFit = fit;
            if (show !== undefined) {
                previewPane.setVisible(show);
            }
        }
    };
    fitToWidth();
    const preview = await createTemplatePreview(view.previewPanel, {
        theme: resolveHostThemeKind(),
    });
    const themeAdapter = createHostThemeAdapter((kind) => {
        applyPageThemeScope("data-bpmn-theme", kind);
        preview.setTheme(kind);
    });
    themeAdapter.setMode("automatic");

    let page = EMPTY_PAGE;
    let fileName: string | undefined;
    let pendingCheck: ReturnType<typeof setTimeout> | undefined;

    const say = ({ text, replacements, verbatim }: PageMessage) =>
        verbatim ? text : translate(text, replacements);

    const session = new TemplateDocumentSession(host, (_text, origin) => refresh(origin));
    const stopRelabelling = i18n.onChange(() => {
        view.relabel();
        // The first file brings the language just before its text; it renders itself.
        if (session.hasDocument) {
            render();
        }
    });
    /** Takes a change of the page into the file, or says why the file cannot take it. */
    function write(result: TemplateEditResult): void {
        if (result.kind === "applied") {
            session.edit(result.text);
        } else {
            page = pageWithRefusal(page, result.path);
            render();
        }
    }
    const builder: TemplateBuilderHandle = previewOnly
        ? { show: () => undefined, destroy: () => undefined }
        : createTemplateBuilder(view.builderRoot, {
              translate,
              onEdit: (edits: TemplateEdit[]) => {
                  if (page.file.kind === "template") {
                      write(applyTemplateEdits(session.text, page.file.path, edits));
                  }
              },
          });

    function render(): void {
        const { choices, selected } = choicesOf(page);
        view.showChoices(choices, selected?.position);
        const main = mainOf(page);
        if (!previewOnly) {
            view.showMain(main);
        }
        view.showPreview(main === "builder");
        view.showEngine(engineOf(page));
        view.showMessages(messagesOf(page, { previewOnly }).map(say));
        const state = builderStateOf(page);
        if (state) {
            builder.show(state);
        }
    }

    /** Shows the text at once; the preview and the validation follow when editing pauses. */
    function refresh(origin: TextOrigin, next = pageForText(page, session.text, origin)): void {
        page = next;
        render();
        if (page.file.kind !== "template") {
            return;
        }
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
        if (page.file.kind !== "template") {
            return;
        }
        const { template, engine } = page.file;
        page = pageWithDiagnostics(page);
        render();
        page = pageWithPreview(page, await preview.show(template, engine));
        view.showMessages(messagesOf(page, { previewOnly }).map(say));
    }

    view.onSelect((position) => {
        refresh("select", pageForSelection(page, session.text, position));
    });
    view.onCreate((engine, elementType, name) => {
        session.edit(newTemplateText(engine, { name, elementType, fileName }));
    });
    view.onChooseEngine((engine) => {
        if (page.file.kind === "unknownEngine") {
            write(withSchema(session.text, page.file.path, engine));
        }
    });

    const route = createHostMessageRouter<TemplateEditorHostMessages>(host, {
        ElementTemplateFileQuery: (query) => {
            if (query.locale) {
                preview.setLocale(query.locale);
            }
            if (query.fileName) {
                fileName = query.fileName;
                view.suggestName(templateIdentity(fileName).name);
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
    window.addEventListener("resize", fitToWidth);
    document.addEventListener("visibilitychange", onVisibilityChange);
    host.postMessage(new GetElementTemplateFileCommand());
    return () => {
        stopRelabelling();
        window.removeEventListener("message", onMessage);
        window.removeEventListener("resize", fitToWidth);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        session.dispose();
        clearTimeout(pendingCheck);
        themeAdapter.dispose();
        previewPane?.dispose();
        builder.destroy();
        preview.destroy();
    };
}
