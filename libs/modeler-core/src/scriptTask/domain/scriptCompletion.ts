import { ScriptKind } from "@miragon/bpmn-modeler-types";

/**
 * Pure helpers backing {@link ScriptCompletionProvider}.
 *
 * Kept separate from the provider so they can be unit-tested without mocking
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
 * The four `ScriptUri` path segments of an on-disk inline script, recovered
 * from a filesystem path.
 */
export interface ParsedScriptPath {
    readonly editorHash: string;
    readonly elementId: string;
    readonly slug: string;
    readonly filename: string;
}

/**
 * Recovers the `ScriptUri` segments from a filesystem path by anchoring on
 * the `tmp/scripting/` marker rather than a fixed depth: the base directory
 * varies (workspace config folder, os tmpdir fallback), so only the segments
 * *after* the marker are stable. Splits on both separators because callers
 * hand in `uri.fsPath`, which uses `\` on Windows.
 */
export function parseScriptPath(path: string): ParsedScriptPath | undefined {
    const segments = path.split(/[/\\]/).filter(Boolean);
    // Find the last marker occurrence: a workspace folder could itself be
    // named `tmp/scripting`, and only the innermost marker is ours.
    let anchor = -1;
    for (let i = segments.length - 2; i >= 0; i--) {
        if (segments[i] === "tmp" && segments[i + 1] === "scripting") {
            anchor = i + 2;
            break;
        }
    }
    if (anchor === -1 || segments.length - anchor !== 4) {
        return undefined;
    }
    const [editorHash, elementId, slug, filename] = segments.slice(anchor);
    return { editorHash, elementId, slug, filename };
}

/**
 * Extracts the editor hash from an inline-script file path. The hash keys the
 * host-side variable store, which the completion provider reads to scope
 * suggestions to the BPMN editor the script belongs to.
 */
export function parseEditorHashFromUri(path: string): string | undefined {
    return parseScriptPath(path)?.editorHash;
}

/**
 * Extracts the script kind from an inline-script file path, reading back the
 * slug written by `ScriptUri.slug`:
 *   - `script-task`                    → `script-task`
 *   - `execution-listener-<i>[-<evt>]` → `execution-listener`
 *   - `task-listener-<i>[-<evt>]`      → `task-listener`
 */
export function parseKindFromUri(path: string): ScriptKind | undefined {
    const slug = parseScriptPath(path)?.slug;
    if (slug === undefined) {
        return undefined;
    }
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
