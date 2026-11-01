import { applyEdits, modify } from "jsonc-parser";

export type JsonPath = (string | number)[];

/** One change to a template, addressed from the template's own root. */
export type TemplateEdit =
    | { kind: "set"; path: JsonPath; value: unknown }
    | { kind: "remove"; path: JsonPath }
    /** Inserts into the array at the path's last segment, an index. */
    | { kind: "insert"; path: JsonPath; value: unknown };

export interface TextFormat {
    insertSpaces: boolean;
    tabSize: number;
    eol: string;
}

// New keys go where a person would write them, not at the end of the object.
const TEMPLATE_KEYS = [
    "$schema",
    "name",
    "id",
    "version",
    "description",
    "documentationRef",
    "category",
    "icon",
    "keywords",
    "engines",
    "deprecated",
    "appliesTo",
    "elementType",
    "groups",
    "properties",
    "scopes",
    "entriesVisible",
];
const PROPERTY_KEYS = [
    "id",
    "label",
    "description",
    "tooltip",
    "type",
    "value",
    "placeholder",
    "optional",
    "feel",
    "language",
    "editable",
    "choices",
    "constraints",
    "group",
    "condition",
    "binding",
];
const BINDING_KEYS = ["type", "name", "property", "key", "source", "scriptFormat", "expression"];

const DEFAULT_FORMAT: TextFormat = { insertSpaces: true, tabSize: 2, eol: "\n" };

/** How the file indents and ends its lines, so inserted text looks like the rest. */
export function textFormatOf(text: string): TextFormat {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const indents = text
        .split(/\r?\n/)
        .map((line) => /^[ \t]+(?=\S)/.exec(line)?.[0])
        .filter((indent): indent is string => indent !== undefined);
    if (indents.length === 0) {
        return { ...DEFAULT_FORMAT, eol };
    }
    if (indents[0].startsWith("\t")) {
        return { insertSpaces: false, tabSize: 1, eol };
    }
    return { insertSpaces: true, tabSize: Math.min(...indents.map((i) => i.length)), eol };
}

/**
 * Applies `edits` to the template at `templatePath` (`[]` for a file holding one
 * template, `[index]` in an array file). Only the edited ranges change, so the
 * file keeps its formatting and every key the edits do not touch.
 */
export function applyTemplateEdits(
    text: string,
    templatePath: JsonPath,
    edits: readonly TemplateEdit[],
): string {
    const formattingOptions = textFormatOf(text);
    return edits.reduce((current, edit) => {
        const value = edit.kind === "remove" ? undefined : edit.value;
        const changes = modify(current, [...templatePath, ...edit.path], value, {
            formattingOptions,
            isArrayInsertion: edit.kind === "insert",
            getInsertionIndex: insertionIndexFor(edit.path),
        });
        return applyEdits(current, changes);
    }, text);
}

function insertionIndexFor(path: JsonPath): ((keys: string[]) => number) | undefined {
    const key = path[path.length - 1];
    if (typeof key !== "string") {
        return undefined;
    }
    const order = keyOrderOf(path.slice(0, -1));
    const rank = (k: string) => {
        const index = order.indexOf(k);
        return index === -1 ? Number.POSITIVE_INFINITY : index;
    };
    return (keys) =>
        keys.reduce(
            (index, existing, position) => (rank(existing) < rank(key) ? position + 1 : index),
            0,
        );
}

function keyOrderOf(objectPath: JsonPath): readonly string[] {
    if (objectPath.length === 0) {
        return TEMPLATE_KEYS;
    }
    const [first, , third] = objectPath;
    if (first !== "properties") {
        return [];
    }
    if (objectPath.length === 2) {
        return PROPERTY_KEYS;
    }
    return objectPath.length === 3 && third === "binding" ? BINDING_KEYS : [];
}
