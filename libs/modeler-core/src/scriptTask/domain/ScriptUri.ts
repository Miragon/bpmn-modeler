import { ScriptKind } from "@miragon/bpmn-modeler-types";

/**
 * Directory (relative to the config folder) that holds all on-disk inline
 * scripts. Doubles as the parse anchor: `parseScriptPath` locates this
 * segment pair inside an absolute path to find the four script segments
 * after it, so the base directory can live anywhere (workspace config
 * folder, os tmpdir fallback) without the parsers caring.
 */
export const TMP_SCRIPTING_SEGMENT = "tmp/scripting";

/**
 * Encodes the `<editorHash>/<elementId>/<slug>/<filename>` path shape used
 * for inline-script documents under `<configFolder>/tmp/scripting/`.
 *
 * Centralised because the slug encodes the script's kind and listener index
 * — `parseScriptPath` reads it back, so changing the convention here also
 * requires updating the parser. The filename is human-facing only; path
 * uniqueness is already guaranteed by the segments above it.
 */
export class ScriptUri {
    constructor(
        readonly editorId: string,
        readonly elementId: string,
        readonly kind: ScriptKind,
        readonly listenerIndex: number | undefined,
        readonly eventName: string | undefined,
        readonly languageExtension: string,
    ) {}

    /**
     * Short, filesystem-safe hash of the editor's document URI. Keeps the
     * script path opaque (the editor URI may contain `:` or `?`) and lets
     * the dispose path wipe everything for an editor by deleting its hash
     * directory.
     */
    static hashEditorId(editorId: string): string {
        let hash = 0;
        for (let i = 0; i < editorId.length; i++) {
            hash = (hash << 5) - hash + editorId.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16);
    }

    get editorHash(): string {
        return ScriptUri.hashEditorId(this.editorId);
    }

    /**
     * Path segment that distinguishes scripts sharing an element. Listener
     * kinds embed the index so multiple listeners of the same type (e.g.
     * two `start` execution listeners) don't collide.
     */
    get slug(): string {
        if (this.kind === "script-task") {
            return "script-task";
        }
        const event = this.eventName ? `-${this.eventName}` : "";
        const idx = this.listenerIndex ?? 0;
        return `${this.kind}-${idx}${event}`;
    }

    /**
     * Human-readable filename for the editor tab strip. Element IDs are
     * XML NCNames in practice but the spec permits characters outside the
     * POSIX-clean subset, so we collapse anything outside `[A-Za-z0-9_-]`
     * to `_`.
     *
     * Examples:
     *   - script task on `Task_1`            → `Task_1.js`
     *   - exec listener (start, idx 0)       → `Task_1.execution-start.js`
     *   - exec listener (start, idx 1)       → `Task_1.execution-start-1.js`
     *   - task listener (create, idx 0)      → `UserTask_1.task-create.js`
     */
    get filename(): string {
        const safeId = this.elementId.replace(/[^A-Za-z0-9_-]/g, "_");
        if (this.kind === "script-task") {
            return `${safeId}.${this.languageExtension}`;
        }
        const prefix = this.kind === "execution-listener" ? "execution" : "task";
        const parts = [prefix];
        if (this.eventName) {
            parts.push(this.eventName);
        }
        const idx = this.listenerIndex ?? 0;
        if (idx > 0) {
            parts.push(String(idx));
        }
        return `${safeId}.${parts.join("-")}.${this.languageExtension}`;
    }

    /**
     * Path relative to the `tmp/scripting/` base directory. The host joins
     * this onto `<configFolder>/tmp/scripting/` to obtain the real file
     * location; the bridge additionally uses the string as the stable
     * `scriptId` across the RPC seam.
     */
    relativePath(): string {
        return `${this.editorHash}/${this.elementId}/${this.slug}/${this.filename}`;
    }

    /**
     * Canonical string identity of the script. Equals {@link relativePath}:
     * the segments alone identify a script regardless of which base
     * directory the file materialises under.
     */
    toString(): string {
        return this.relativePath();
    }
}

/** The kind/index/event a script {@link ScriptUri.slug} encodes. */
export interface ParsedScriptSlug {
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly eventName: string | undefined;
}

// Reverse of {@link ScriptUri.slug} for listener kinds: `<kind>-<index>[-<event>]`.
// The `(\d+)` index and optional trailing event are both greedy-safe because the
// index cannot contain `-` and the event, when present, is the whole remainder.
const LISTENER_SLUG = /^(execution-listener|task-listener)-(\d+)(?:-(.+))?$/;

/**
 * Recovers the kind, listener index, and event from a script's slug segment —
 * the inverse of {@link ScriptUri.slug}. Adoption of an externally opened script
 * file needs the full addressing (not just the kind {@link parseKindFromUri}
 * gives) to track and lock the right panel field.
 *
 * `"script-task"` → the script-task shape; a well-formed listener slug → its
 * parsed fields; anything else → `undefined` (the caller bails on adoption).
 */
export function parseScriptSlug(slug: string): ParsedScriptSlug | undefined {
    if (slug === "script-task") {
        return { kind: "script-task", listenerIndex: undefined, eventName: undefined };
    }
    const match = LISTENER_SLUG.exec(slug);
    if (!match) {
        return undefined;
    }
    return {
        kind: match[1] as ScriptKind,
        listenerIndex: Number(match[2]),
        eventName: match[3],
    };
}
