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

/**
 * Extracts the script kind from a `bpmn-script://` URI path written by
 * `ScriptTaskService.slugFor`.
 *
 * Path shape: `/<editorHash>/<elementId>/<slug>/script.<ext>`
 *   - `script-task`                    → `script-task`
 *   - `execution-listener-<i>[-<evt>]` → `execution-listener`
 *   - `task-listener-<i>[-<evt>]`      → `task-listener`
 */
export function parseKindFromUri(path: string): ScriptKind | undefined {
    const segments = path.split("/").filter(Boolean);
    // We need at least <hash>/<elementId>/<slug>/<file>.
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
