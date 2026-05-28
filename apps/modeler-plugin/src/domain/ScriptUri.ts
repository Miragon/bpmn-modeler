import { ScriptKind } from "@miragon/bpmn-modeler-shared";

/**
 * Encodes the `bpmn-script:/<editorHash>/<elementId>/<slug>/<filename>` URI
 * shape used for virtual inline-script documents.
 *
 * Centralised because the slug encodes the script's kind and listener index
 * — `parseKindFromUri` reads it back, so changing the convention here also
 * requires updating the parser. The filename is human-facing only; URI
 * uniqueness is already guaranteed by the path segments above it.
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
     * script-URI path opaque (the editor URI may contain `:` or `?`) and
     * lets the dispose path wipe everything for an editor via a prefix
     * delete.
     */
    static hashEditorId(editorId: string): string {
        let hash = 0;
        for (let i = 0; i < editorId.length; i++) {
            hash = (hash << 5) - hash + editorId.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Prefix shared by every script URI for this editor — used by the
     * dispose sweep to delete all orphaned virtual files in one pass.
     */
    static editorPathPrefix(editorId: string): string {
        return `/${ScriptUri.hashEditorId(editorId)}/`;
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
     * Full URI string suitable for `Uri.parse(...)`.
     */
    toString(): string {
        return `bpmn-script:/${this.editorHash}/${this.elementId}/${this.slug}/${this.filename}`;
    }
}
