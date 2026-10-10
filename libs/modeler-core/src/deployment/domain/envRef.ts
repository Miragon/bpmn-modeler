import { UnresolvedEnvVariableError } from "../../shared/domain/errors";

const ENV_REF_PATTERN = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;
const WHOLE_ENV_REF_PATTERN = /^\$\{env:[A-Za-z_][A-Za-z0-9_]*\}$/;

export type EnvLookup = (name: string) => string | undefined;

/**
 * Malformed refs (bad variable names) are not matched and pass through verbatim.
 *
 * @throws {UnresolvedEnvVariableError} when a matched variable has no value —
 *   never falls back to the literal ref, which would reach the engine as-is.
 */
export function expandEnvRefs(value: string, lookup: EnvLookup, field: string): string {
    return value.replace(ENV_REF_PATTERN, (_match, name: string) => {
        const resolved = lookup(name);
        if (resolved === undefined) {
            throw new UnresolvedEnvVariableError(name, field);
        }
        return resolved;
    });
}

export function expandOptionalEnvRefs(
    value: string | undefined,
    lookup: EnvLookup,
    field: string,
): string | undefined {
    return value === undefined ? undefined : expandEnvRefs(value, lookup, field);
}

/** Keeps unresolved refs verbatim, for keys that must be computable without every variable set. */
export function expandEnvRefsLeniently(value: string, lookup: EnvLookup): string {
    return value.replace(ENV_REF_PATTERN, (match, name: string) => lookup(name) ?? match);
}

/**
 * Only a whole-value ref is shareable: partial interpolation (`user-${env:X}`)
 * may embed a literal secret fragment.
 */
export function isWholeEnvRef(value: string): boolean {
    return WHOLE_ENV_REF_PATTERN.test(value.trim());
}

export function blankIfWholeEnvRef(value: string): string {
    return isWholeEnvRef(value) ? "" : value;
}
