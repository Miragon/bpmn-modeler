import {
    DisallowedEnvReferenceError,
    UnresolvedEnvVariableError,
} from "../../shared/domain/errors";

/**
 * A committed targets file chooses both the destination and the variables, so
 * an open namespace would let it send any unrelated `.env` secret to its own
 * endpoint. Only variables named for the modeler are ever resolvable.
 */
export const ENV_VARIABLE_PREFIX = "MIRAGON_";

const REFERENCE_START = "${env:";
const REFERENCE_CANDIDATE_PATTERN = /\$\{env:([^}]*)(\}?)/g;
const REFERENCEABLE_NAME_PATTERN = new RegExp(`^${ENV_VARIABLE_PREFIX}[A-Za-z0-9_]+$`);
const WHOLE_ENV_REF_PATTERN = new RegExp(`^\\$\\{env:${ENV_VARIABLE_PREFIX}[A-Za-z0-9_]+\\}$`);

/** `source` names the `.env` that was searched, for an actionable "not set" message. */
export type EnvLookup = ((name: string) => string | undefined) & { readonly source?: string };

/** `resolved`: every non-blank value handed out, which is what a request built from it carries. */
export type RecordingEnvLookup = EnvLookup & { readonly resolved: ReadonlySet<string> };

export const NO_ENV_VARIABLES: EnvLookup = () => undefined;

export interface EnvReferencing {
    referencesEnv(): boolean;
}

function isReferenceableEnvVariable(name: string): boolean {
    return REFERENCEABLE_NAME_PATTERN.test(name);
}

/** Any `${env:` counts, including malformed ones, so they reach validation instead of the engine. */
export function containsEnvRef(value: string | undefined): boolean {
    return value !== undefined && value.includes(REFERENCE_START);
}

export function envRefsIn(...values: (string | undefined)[]): EnvReferencing {
    return { referencesEnv: () => values.some(containsEnvRef) };
}

/**
 * Every `${env:` must open a well-formed reference to a prefixed variable, so a
 * typo or a foreign variable fails loudly instead of being sent verbatim.
 *
 * @throws {DisallowedEnvReferenceError}
 */
export function assertEnvRefsValid(value: string | undefined, field: string): void {
    if (value === undefined) return;
    for (const [, name, closingBrace] of value.matchAll(REFERENCE_CANDIDATE_PATTERN)) {
        assertReferenceable(name, closingBrace, field);
    }
}

/**
 * @throws {DisallowedEnvReferenceError} for a malformed or non-prefixed reference.
 * @throws {UnresolvedEnvVariableError} when a variable has no value — never
 *   falls back to the literal ref, which would reach the engine as-is.
 */
export function expandEnvRefs(value: string, lookup: EnvLookup, field: string): string {
    return value.replace(
        REFERENCE_CANDIDATE_PATTERN,
        (_reference, name: string, closingBrace: string) => {
            assertReferenceable(name, closingBrace, field);
            const resolved = lookup(name);
            if (resolved === undefined) {
                throw new UnresolvedEnvVariableError(name, field, lookup.source);
            }
            return resolved;
        },
    );
}

/**
 * A whole ref is expanded in its trimmed form, matching how it was classified
 * and stored, so a padded paste can't send a padded secret.
 */
export function expandCredentialEnvRefs(value: string, lookup: EnvLookup, field: string): string {
    return expandEnvRefs(wholeEnvRefOf(value) ?? value, lookup, field);
}

export function expandOptionalEnvRefs(
    value: string | undefined,
    lookup: EnvLookup,
    field: string,
): string | undefined {
    return value === undefined ? undefined : expandEnvRefs(value, lookup, field);
}

/** Keeps unresolvable refs verbatim, for keys that must be computable without every variable set. */
export function expandEnvRefsLeniently(value: string, lookup: EnvLookup): string {
    return value.replace(
        REFERENCE_CANDIDATE_PATTERN,
        (reference, name: string, closingBrace: string) =>
            closingBrace && isReferenceableEnvVariable(name)
                ? (lookup(name) ?? reference)
                : reference,
    );
}

/**
 * Only a whole-value ref is shareable: partial interpolation (`user-${env:X}`)
 * may embed a literal secret fragment.
 */
export function isWholeEnvRef(value: string): boolean {
    return WHOLE_ENV_REF_PATTERN.test(value);
}

/** Form input is matched trimmed, so a stray space doesn't turn a ref into a literal. */
export function wholeEnvRefOf(input: string | undefined): string | undefined {
    const trimmed = input?.trim();
    return trimmed !== undefined && isWholeEnvRef(trimmed) ? trimmed : undefined;
}

/** Keeps only what a reference can name, so no other `.env` entry is retained or resolvable. */
export function referenceableVariables(
    variables: ReadonlyMap<string, string>,
    source: string,
): EnvLookup {
    const referenceable = new Map(
        [...variables].filter(([name]) => isReferenceableEnvVariable(name)),
    );
    return Object.assign((name: string) => referenceable.get(name), { source });
}

export function recordingLookup(lookup: EnvLookup): RecordingEnvLookup {
    const resolved = new Set<string>();
    const record = (name: string): string | undefined => {
        const value = lookup(name);
        if (value !== undefined && value.trim() !== "") {
            resolved.add(value);
        }
        return value;
    };
    return Object.assign(record, { source: lookup.source, resolved });
}

export function emptyEnvLookup(source: string): EnvLookup {
    return Object.assign(() => undefined, { source });
}

function assertReferenceable(name: string, closingBrace: string, field: string): void {
    if (!closingBrace || !isReferenceableEnvVariable(name)) {
        throw new DisallowedEnvReferenceError(field, ENV_VARIABLE_PREFIX);
    }
}
