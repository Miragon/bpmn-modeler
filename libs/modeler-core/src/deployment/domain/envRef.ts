import { UnresolvedEnvVariableError } from "../../shared/domain/errors";

const ENV_REF_PATTERN = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;
const WHOLE_ENV_REF_PATTERN = /^\$\{env:[A-Za-z_][A-Za-z0-9_]*\}$/;

/**
 * A lookup returns `undefined` for an unknown variable; the caller decides
 * whether that is fatal (request-build) or tolerable.
 */
export type EnvLookup = (name: string) => string | undefined;

/**
 * Replaces every `${env:VAR}` occurrence in `value` with the looked-up variable.
 * Malformed refs (bad variable names) are not matched and pass through verbatim.
 *
 * Returns the same string instance when it holds no ref, so callers can skip
 * file I/O on the fast path by identity comparison.
 *
 * @throws {UnresolvedEnvVariableError} when a matched variable has no value.
 */
export function expandEnvRefs(value: string, lookup: EnvLookup, field?: string): string {
    if (!value.includes("${env:")) {
        return value;
    }
    return value.replace(ENV_REF_PATTERN, (_match, name: string) => {
        const resolved = lookup(name);
        if (resolved === undefined) {
            throw new UnresolvedEnvVariableError(name, field);
        }
        return resolved;
    });
}

/**
 * Whether `value`'s entire trimmed content is a single `${env:VAR}` ref — the
 * shape allowed to live in the shared targets file, since a reference is not a
 * secret. Partial interpolation (`user-${env:X}`) is not shareable and returns
 * `false`.
 */
export function isWholeEnvRef(value: string): boolean {
    return WHOLE_ENV_REF_PATTERN.test(value.trim());
}
