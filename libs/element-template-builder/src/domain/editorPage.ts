import type { Engine } from "@miragon/bpmn-modeler-types";

import { templateDiagnostics, type Diagnostic } from "./diagnostics";
import {
    readTemplateFile,
    type TemplateChoice,
    type TemplateFileState,
    type TemplateSelection,
} from "./templateFile";
import type { JsonPath } from "./templateText";

/** What the builder shows and may do. */
export interface TemplateBuilderState {
    template: Record<string, unknown>;
    engine: Engine;
    /** Whether edits are allowed; while the file's JSON is broken they are not. */
    editable: boolean;
    diagnostics: readonly Diagnostic[];
}

/** A text to translate, or a text no translation knows. */
export interface PageMessage {
    text: string;
    replacements?: Record<string, string>;
    verbatim?: true;
}

/** The builder, the start form, the engine choice, or a note while nothing can be built. */
export type EditorMain = "builder" | "wizard" | "engineChoice" | "placeholder";

/** Where a change of the text came from: the host's document, an edit here, or another reason to read it again. */
export type TextOrigin = "host" | "edit" | "select";

export interface TemplatePreviewResult {
    rendered: boolean;
    errors: readonly string[];
    unsupportedType?: string;
}

/** Everything the template editor page shows, derived from the file's text and what happened to it. */
export interface EditorPage {
    readonly file: TemplateFileState;
    readonly selection?: TemplateSelection;
    /** While the JSON is broken, the builder stays on this, read-only. */
    readonly lastShown?: TemplateBuilderState;
    /** Why the last edit could not be written, until an edit goes through. */
    readonly refusal?: PageMessage;
    readonly previewNotes: readonly PageMessage[];
}

export const EMPTY_PAGE: EditorPage = { file: { kind: "empty" }, previewNotes: [] };

/** The page for the file's text. The page's own edits never move a template, but can change its key. */
export function pageForText(page: EditorPage, text: string, origin: TextOrigin): EditorPage {
    const file = readTemplateFile(
        text,
        origin === "edit" && page.selection
            ? { position: page.selection.position }
            : page.selection,
    );
    const selected = selectedChoiceOf(file);
    return {
        ...page,
        file,
        selection: selected ? { position: selected.position, key: selected.key } : page.selection,
        lastShown:
            file.kind === "template"
                ? {
                      template: file.template,
                      engine: file.engine,
                      editable: true,
                      diagnostics: page.lastShown?.diagnostics ?? [],
                  }
                : page.lastShown,
        refusal: origin === "edit" ? undefined : page.refusal,
    };
}

/** The user picked another template of the file. */
export function pageForSelection(page: EditorPage, text: string, position: number): EditorPage {
    return pageForText({ ...page, selection: { position } }, text, "select");
}

/** What the validator and the builder's rules find, once editing pauses. */
export function pageWithDiagnostics(page: EditorPage): EditorPage {
    if (page.file.kind !== "template" || !page.lastShown) {
        return page;
    }
    const diagnostics = templateDiagnostics(page.file.template, page.file.engine);
    return { ...page, lastShown: { ...page.lastShown, diagnostics } };
}

/** An edit the JSON could not take: the page stays as it was and says so. */
export function pageWithRefusal(page: EditorPage, path: JsonPath): EditorPage {
    return {
        ...page,
        refusal: {
            text: "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.",
            replacements: { path: path.join(".") },
        },
    };
}

export function pageWithPreview(page: EditorPage, outcome: TemplatePreviewResult): EditorPage {
    return { ...page, previewNotes: previewNotesFor(outcome, page.lastShown?.diagnostics ?? []) };
}

function previewNotesFor(
    { rendered, errors, unsupportedType }: TemplatePreviewResult,
    diagnostics: readonly Diagnostic[],
): PageMessage[] {
    if (rendered) {
        return [];
    }
    if (unsupportedType) {
        return [
            {
                text: "Templates for {type} cannot be previewed yet.",
                replacements: { type: unsupportedType },
            },
        ];
    }
    return diagnostics.length > 0
        ? [{ text: "The preview shows the last template without errors." }]
        : errors.map((text) => ({ text, verbatim: true }));
}

/** While the JSON is broken, the builder stays on the last template it showed, if any. */
export function mainOf({ file, lastShown }: EditorPage): EditorMain {
    switch (file.kind) {
        case "empty":
            return "wizard";
        case "unknownEngine":
            return "engineChoice";
        case "template":
            return "builder";
        default:
            return lastShown ? "builder" : "placeholder";
    }
}

export function builderStateOf({ file, lastShown }: EditorPage): TemplateBuilderState | undefined {
    if (!lastShown) {
        return undefined;
    }
    return file.kind === "template" ? lastShown : { ...lastShown, editable: false };
}

export function engineOf({ file }: EditorPage): Engine | undefined {
    return file.kind === "template" ? file.engine : undefined;
}

export function choicesOf({ file }: EditorPage): {
    choices: readonly TemplateChoice[];
    selected: TemplateChoice | undefined;
} {
    const selected = selectedChoiceOf(file);
    return selected && "choices" in file
        ? { choices: file.choices, selected }
        : { choices: [], selected: undefined };
}

function selectedChoiceOf(file: TemplateFileState): TemplateChoice | undefined {
    return file.kind === "template" || file.kind === "unknownEngine" ? file.selected : undefined;
}

/** What the page says above its main area. A preview alone cannot write the file, so it only says what it cannot show. */
export function messagesOf(
    page: EditorPage,
    { previewOnly }: { previewOnly: boolean },
): PageMessage[] {
    const { file, refusal, previewNotes, lastShown } = page;
    switch (file.kind) {
        case "template":
            return refusal ? [refusal] : [...previewNotes];
        case "empty":
            return previewOnly ? [NOT_A_TEMPLATE] : [];
        case "notATemplate":
            return [NOT_A_TEMPLATE];
        case "unknownEngine":
            return [{ text: 'The template has no "$schema" that names its engine.' }];
        case "invalidJson":
            return [
                { text: "The JSON is invalid: {message}", replacements: { message: file.message } },
                ...(previewOnly
                    ? lastShown
                        ? [{ text: "The preview shows the last template without errors." }]
                        : []
                    : [
                          {
                              text: "Fix it in the JSON editor; until then the builder is read-only.",
                          },
                      ]),
            ];
    }
}

const NOT_A_TEMPLATE: PageMessage = { text: "This file does not contain an element template." };
