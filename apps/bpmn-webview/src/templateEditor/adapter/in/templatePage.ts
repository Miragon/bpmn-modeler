import type { TemplatePreviewHandle } from "@miragon/bpmn-modeler";
import {
    applyTemplateEdits,
    builderStateOf,
    choicesOf,
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

import type { TemplateDocumentSession } from "../../service/documentSession";
import type { EditorView } from "./editorView";

type Translate = (template: string, replacements?: Record<string, string>) => string;

// Host edits arrive already debounced; this skips the half-typed states of the page's own.
const EDIT_DEBOUNCE_MS = 300;

export interface TemplatePageHandles {
    readonly view: EditorView;
    readonly session: Pick<TemplateDocumentSession, "text" | "hasDocument" | "edit">;
    readonly builder: Pick<TemplateBuilderHandle, "show">;
    readonly preview: Pick<TemplatePreviewHandle, "show">;
    readonly translate: Translate;
    readonly previewOnly: boolean;
    readonly logError: (message: string) => void;
}

/** The template editor's page: what the file holds, shown in the view, the builder and the preview. */
export interface TemplatePage {
    /** Shows the session's text at once; the preview and the validation follow when editing pauses. */
    showText(origin: TextOrigin): void;
    /** Takes the builder's edits into the file, or says why the file cannot take them. */
    applyBuilderEdits(edits: readonly TemplateEdit[]): void;
    /** Names a new template after the file it is written to. */
    useFileName(fileName: string): void;
    /** Shows the page again in the language now chosen. */
    relabel(): void;
    dispose(): void;
}

export function createTemplatePage({
    view,
    session,
    builder,
    preview,
    translate,
    previewOnly,
    logError,
}: TemplatePageHandles): TemplatePage {
    let page = EMPTY_PAGE;
    let fileName: string | undefined;
    let pendingCheck: ReturnType<typeof setTimeout> | undefined;

    const say = ({ text, replacements, verbatim }: PageMessage) =>
        verbatim ? text : translate(text, replacements);
    const shownMessages = () => messagesOf(page, { previewOnly }).map(say);

    function render(): void {
        const { choices, selected } = choicesOf(page);
        view.showChoices(choices, selected?.position);
        const main = mainOf(page);
        if (!previewOnly) {
            view.showMain(main);
        }
        view.showPreview(main === "builder");
        view.showEngine(engineOf(page));
        view.showMessages(shownMessages());
        const state = builderStateOf(page);
        if (state) {
            builder.show(state);
        }
    }

    function write(result: TemplateEditResult): void {
        if (result.kind === "applied") {
            session.edit(result.text);
        } else {
            page = pageWithRefusal(page, result.path);
            render();
        }
    }

    function showText(origin: TextOrigin, next = pageForText(page, session.text, origin)): void {
        page = next;
        render();
        if (page.file.kind !== "template") {
            return;
        }
        clearTimeout(pendingCheck);
        pendingCheck = setTimeout(
            () =>
                void check().catch((error: unknown) =>
                    logError(`Template preview failed: ${String(error)}`),
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
        view.showMessages(shownMessages());
    }

    view.onSelect((position) => {
        showText("select", pageForSelection(page, session.text, position));
    });
    view.onCreate((engine, elementType, name) => {
        session.edit(newTemplateText(engine, { name, elementType, fileName }));
    });
    view.onChooseEngine((engine) => {
        if (page.file.kind === "unknownEngine") {
            write(withSchema(session.text, page.file.path, engine));
        }
    });

    return {
        showText: (origin) => showText(origin),
        applyBuilderEdits: (edits) => {
            if (page.file.kind === "template") {
                write(applyTemplateEdits(session.text, page.file.path, edits));
            }
        },
        useFileName: (name) => {
            fileName = name;
            view.suggestName(templateIdentity(name).name);
        },
        relabel: () => {
            view.relabel();
            // The first file brings the language just before its text; it renders itself.
            if (session.hasDocument) {
                render();
            }
        },
        dispose: () => clearTimeout(pendingCheck),
    };
}
