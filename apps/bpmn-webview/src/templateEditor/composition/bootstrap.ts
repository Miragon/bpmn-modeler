import { createTemplatePreview } from "@miragon/bpmn-modeler";
import {
    createTemplateBuilder,
    type TemplateBuilderHandle,
} from "@miragon/bpmn-modeler-element-template-builder";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    applyPageThemeScope,
    createHostThemeAdapter,
    createInertLock,
    GetElementTemplateFileCommand,
    initResizer,
    LogErrorCommand,
    type MessageOfType,
    resolveHostThemeKind,
} from "@miragon/bpmn-modeler-shared";

import { createHostMessageRouter, type HostMessage } from "../../adapter/in/messageRouter";
import { TemplateDocumentSession } from "../service/documentSession";
import { mountEditorView } from "../adapter/in/editorView";
import { createPreviewPaneFit } from "../adapter/in/previewPaneFit";
import { createTemplatePage } from "../adapter/in/templatePage";
import type { TemplateEditorHost } from "../port/templateEditorHost";

type EditorHost = Pick<TemplateEditorHost, "postMessage">;
type Translate = (template: string, replacements?: Record<string, string>) => string;

type TemplateEditorHostMessages = {
    ElementTemplateFileQuery: MessageOfType<"ElementTemplateFileQuery">;
    LanguageQuery: MessageOfType<"LanguageQuery">;
    FlushDocumentQuery: MessageOfType<"FlushDocumentQuery">;
    ReleaseDocumentFlushQuery: MessageOfType<"ReleaseDocumentFlushQuery">;
};

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
    const fitPreviewPane = previewPane && createPreviewPaneFit(previewPane);
    const fitToWidth = () => fitPreviewPane?.(window.innerWidth);
    fitToWidth();
    const preview = await createTemplatePreview(view.previewPanel, {
        theme: resolveHostThemeKind(),
    });
    const themeAdapter = createHostThemeAdapter((kind) => {
        applyPageThemeScope("data-bpmn-theme", kind);
        preview.setTheme(kind);
    });
    themeAdapter.setMode("automatic");

    const session = new TemplateDocumentSession(
        host,
        (_text, origin) => page.showText(origin),
        createInertLock(document.body),
    );
    const builder: TemplateBuilderHandle = previewOnly
        ? { show: () => undefined, destroy: () => undefined }
        : createTemplateBuilder(view.builderRoot, {
              translate,
              onEdit: (edits) => page.applyBuilderEdits(edits),
          });
    const page = createTemplatePage({
        view,
        session,
        builder,
        preview,
        translate,
        previewOnly,
        logError: (message) => host.postMessage(new LogErrorCommand(message)),
    });
    const stopRelabelling = i18n.onChange(() => page.relabel());

    const route = createHostMessageRouter<TemplateEditorHostMessages>(host, {
        ElementTemplateFileQuery: (query) => {
            if (query.locale) {
                preview.setLocale(query.locale);
            }
            if (query.fileName) {
                page.useFileName(query.fileName);
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
        page.dispose();
        themeAdapter.dispose();
        previewPane?.dispose();
        builder.destroy();
        preview.destroy();
    };
}
