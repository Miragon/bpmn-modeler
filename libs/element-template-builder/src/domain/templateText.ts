import { applyEdits, modify } from "jsonc-parser";

import { BINDING_KEY_ORDER, PROPERTY_KEY_ORDER, TEMPLATE_KEY_ORDER } from "./templateKeys";

export type JsonPath = (string | number)[];

/** One change to a template, addressed from the template's own root. */
export type TemplateEdit =
    | { kind: "set"; path: JsonPath; value: unknown }
    | { kind: "remove"; path: JsonPath }
    /** Inserts into the array at the path's last segment, an index. */
    | { kind: "insert"; path: JsonPath; value: unknown };

export type TemplateEditResult =
    | { kind: "applied"; text: string }
    /** The JSON around `path` is not the object or list the edit needs; the text stays as it was. */
    | { kind: "refused"; path: JsonPath };

export interface TextFormat {
    insertSpaces: boolean;
    tabSize: number;
    eol: string;
}

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
 * file keeps its formatting and every key the edits do not touch. All edits go
 * through, or none does.
 */
export function applyTemplateEdits(
    text: string,
    templatePath: JsonPath,
    edits: readonly TemplateEdit[],
): TemplateEditResult {
    const formattingOptions = textFormatOf(text);
    let current = text;
    for (const edit of edits) {
        const value = edit.kind === "remove" ? undefined : edit.value;
        try {
            const changes = modify(current, [...templatePath, ...edit.path], value, {
                formattingOptions,
                isArrayInsertion: edit.kind === "insert",
                getInsertionIndex: insertionIndexFor(edit.path),
            });
            current = applyEdits(current, changes);
        } catch {
            // jsonc-parser throws when a value on the path is not the container the path needs.
            return { kind: "refused", path: edit.path };
        }
    }
    return { kind: "applied", text: current };
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
        return TEMPLATE_KEY_ORDER;
    }
    const [first, , third] = objectPath;
    if (first !== "properties") {
        return [];
    }
    if (objectPath.length === 2) {
        return PROPERTY_KEY_ORDER;
    }
    return objectPath.length === 3 && third === "binding" ? BINDING_KEY_ORDER : [];
}
