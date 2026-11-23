import { ENGINE_LABEL, type Engine } from "@miragon/bpmn-modeler-types/domain";

import type { VersionName } from "./versionNames";

/** Why the merge refuses its versions, for a caller to explain in its own words. */
export type MergeRefusal =
    /** The parser rejected the text, as it does a Git LFS pointer; `detail` is the parser's. */
    | { readonly kind: "unparsable"; readonly version: VersionName; readonly detail: string }
    /** The version parsed with warnings, such as an unresolved reference; `detail` names them. */
    | {
          readonly kind: "parsesWithWarnings";
          readonly version: VersionName;
          readonly detail: string;
      }
    | { readonly kind: "mixedEngines"; readonly current: Engine; readonly incoming: Engine }
    | {
          readonly kind: "elementWithoutId";
          readonly version: VersionName;
          readonly elementType: string;
      };

const REASON: {
    [K in MergeRefusal["kind"]]: (refusal: Extract<MergeRefusal, { kind: K }>) => string;
} = {
    unparsable: ({ version, detail }) => `${version} does not parse: ${detail}`,
    parsesWithWarnings: ({ version, detail }) => `${version} does not parse: ${detail}`,
    mixedEngines: ({ current, incoming }) =>
        `current is for ${ENGINE_LABEL[current]} and incoming for ${ENGINE_LABEL[incoming]}: a merge needs one engine`,
    elementWithoutId: ({ version, elementType }) =>
        `${version} holds a ${elementType} without an id: the merge matches root elements and lanes by id`,
};

/** A refusal thrown as an error, its English reason for a developer, the refusal for the caller. */
class MergeRefusedError extends Error {
    constructor(
        readonly refusal: MergeRefusal,
        cause?: unknown,
    ) {
        super((REASON[refusal.kind] as (refusal: MergeRefusal) => string)(refusal));
        this.name = "MergeRefusedError";
        // `ErrorOptions` and `Error.cause` are not in this lib target, but are in its consumers'.
        if (cause !== undefined) Object.assign(this, { cause });
    }
}

export function mergeRefusal(refusal: MergeRefusal, cause?: unknown): Error {
    return new MergeRefusedError(refusal, cause);
}

/** What a version the parser rejected is refused as, the parser's error kept as the cause. */
export function parseFailure(version: VersionName, error: unknown): Error {
    const detail = error instanceof Error ? error.message : String(error);
    return mergeRefusal({ kind: "unparsable", version, detail }, error);
}

/** The refusal of the error the merge threw, or none for any other error. */
export function mergeRefusalOf(error: unknown): MergeRefusal | undefined {
    return error instanceof MergeRefusedError ? error.refusal : undefined;
}
