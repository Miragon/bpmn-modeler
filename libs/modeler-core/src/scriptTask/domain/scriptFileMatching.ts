import { ScriptKind } from "@miragon/bpmn-modeler-types";

import { parseScriptPath } from "./scriptCompletion";
import { ScriptLanguage } from "./scriptLanguage";
import { parseScriptSlug, ScriptUri } from "./ScriptUri";

/** A file path successfully matched back to a live script identity. */
export interface MatchedScriptFile {
    readonly editorId: string;
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly language: ScriptLanguage;
    readonly filename: string;
    /** `ScriptUri` relative path — doubles as the bridge's stable `scriptId`. */
    readonly scriptId: string;
}

/**
 * Matches an opened file path back to the script identity it encodes, or
 * `undefined` when the file is not an adoptable inline script.
 *
 * Both hosts adopt externally opened script files (Explorer/Project view,
 * or the "Generate Script Files" output) into live sync; this is the single
 * decision point for what counts as adoptable, so the hosts can never drift:
 * a malformed path or slug, an ambient sibling (`camunda.d.ts`/`jsconfig.json`
 * — their extensions resolve to no {@link ScriptLanguage}), and a path whose
 * editor hash reverses to no live editor (no model to sync into) all return
 * `undefined`. Containment in the editor's actual base directory remains the
 * caller's job — resolving that directory is host-specific.
 */
export function matchScriptFile(
    path: string,
    editorIds: readonly string[],
): MatchedScriptFile | undefined {
    const parsed = parseScriptPath(path);
    if (!parsed) {
        return undefined;
    }
    const slug = parseScriptSlug(parsed.slug);
    if (!slug) {
        return undefined;
    }
    // `dot > 0` mirrors posix `extname`: no dot and a leading-dot-only name
    // both count as extensionless (and thus not a script).
    const dot = parsed.filename.lastIndexOf(".");
    const language =
        dot > 0 ? ScriptLanguage.fromExtension(parsed.filename.slice(dot + 1)) : undefined;
    if (!language) {
        return undefined;
    }
    const editorId = editorIds.find((id) => ScriptUri.hashEditorId(id) === parsed.editorHash);
    if (editorId === undefined) {
        return undefined;
    }
    return {
        editorId,
        elementId: parsed.elementId,
        kind: slug.kind,
        listenerIndex: slug.listenerIndex,
        language,
        filename: parsed.filename,
        scriptId: [parsed.editorHash, parsed.elementId, parsed.slug, parsed.filename].join("/"),
    };
}
