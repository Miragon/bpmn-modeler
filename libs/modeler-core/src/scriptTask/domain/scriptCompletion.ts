import { ScriptKind } from "@miragon/bpmn-modeler-shared";

/**
 * Pure helpers backing {@link ScriptCompletionProvider}.
 *
 * Extracted from the provider so they can be unit-tested without mocking
 * the `vscode` module — the provider itself depends on `vscode.languages`,
 * `CompletionItem`, etc., which the jest test environment doesn't supply.
 */

/**
 * Returns the bean name immediately preceding a trailing `.` on the given
 * line, or undefined if the line doesn't end in `<identifier>.`.
 *
 * Examples:
 *   `execution.`         → `"execution"`
 *   `  task.`            → `"task"`
 *   `def x = execution.` → `"execution"`
 *   `execution`          → undefined (no trailing dot)
 *   `foo.bar.`           → `"bar"` (deepest segment)
 */
export function matchMemberAccess(linePrefix: string): string | undefined {
    const match = /([A-Za-z_][A-Za-z0-9_]*)\.\s*$/.exec(linePrefix);
    return match ? match[1] : undefined;
}

// `getVariable("…` / `setVariableLocal('…` etc. with an *unterminated* string
// argument at the end of the line. Group 1 is the method name (Local suffix
// included), group 2 the partial variable name typed so far (possibly empty,
// right after the opening quote). The absence of a closing quote is what scopes
// this to "the cursor is inside the variable-name argument".
const VARIABLE_STRING_ARG = /((?:get|set|has|remove)Variable(?:Local)?)\s*\(\s*["']([^"'\\]*)$/;

/**
 * When the cursor sits inside the string argument of a
 * `getVariable`/`setVariable`/`hasVariable`/`removeVariable` (`Local`) call,
 * returns the method name and the partial variable name typed so far. Drives
 * variable-name completion; `undefined` for any other position so the provider
 * falls through to its bean/root modes.
 */
export function matchVariableStringArg(
    linePrefix: string,
): { methodName: string; partial: string } | undefined {
    const match = VARIABLE_STRING_ARG.exec(linePrefix);
    return match ? { methodName: match[1], partial: match[2] } : undefined;
}

/**
 * Extracts the editor hash (first path segment) from a `bpmn-script://` URI
 * path. The hash keys the host-side variable store, which the completion
 * provider reads to scope suggestions to the BPMN editor the script belongs to.
 *
 * Path shape: `/<editorHash>/<elementId>/<slug>/<filename>`.
 */
export function parseEditorHashFromUri(path: string): string | undefined {
    return path.split("/").filter(Boolean)[0];
}

/**
 * Extracts the script kind from a `bpmn-script://` URI path written by
 * `ScriptUri.slug`.
 *
 * Path shape: `/<editorHash>/<elementId>/<slug>/script.<ext>`
 *   - `script-task`                    → `script-task`
 *   - `execution-listener-<i>[-<evt>]` → `execution-listener`
 *   - `task-listener-<i>[-<evt>]`      → `task-listener`
 */
export function parseKindFromUri(path: string): ScriptKind | undefined {
    const segments = path.split("/").filter(Boolean);
    /**
     * We need at least <hash>/<elementId>/<slug>/<file>.
     */
    if (segments.length < 4) {
        return undefined;
    }
    const slug = segments[segments.length - 2];
    if (slug === "script-task") {
        return "script-task";
    }
    if (slug.startsWith("execution-listener")) {
        return "execution-listener";
    }
    if (slug.startsWith("task-listener")) {
        return "task-listener";
    }
    return undefined;
}
