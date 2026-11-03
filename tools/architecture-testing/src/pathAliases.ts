import { posix } from "node:path";
import * as ts from "typescript";

import { resolveWithSuffixes } from "./importGraph";

export interface PathAlias {
    /** A specifier, or one with a single `*` as tsconfig `paths` allow. */
    readonly pattern: string;
    /** POSIX paths relative to the config's directory. */
    readonly targets: readonly string[];
}

/** The `compilerOptions.paths` of a tsconfig in the tree root. */
export function readPathAliases(configText: string): PathAlias[] {
    const { config, error } = ts.parseConfigFileTextToJson("tsconfig.json", configText);
    if (error !== undefined) {
        throw new Error(
            `tsconfig paths unreadable: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`,
        );
    }
    const paths: Record<string, string[]> = config.compilerOptions?.paths ?? {};
    return Object.entries(paths).map(([pattern, targets]) => ({
        pattern,
        targets: targets.map((target) => posix.normalize(target)),
    }));
}

/** An exact pattern wins over a wildcard one, then the longest prefix, as TypeScript resolves. */
export function resolveAliasImport(
    specifier: string,
    aliases: readonly PathAlias[],
    known: ReadonlySet<string>,
): string | undefined {
    const exact = aliases.find(({ pattern }) => pattern === specifier);
    const targets = exact?.targets ?? wildcardTargets(specifier, aliases);
    for (const target of targets) {
        const resolved = resolveWithSuffixes(target, known);
        if (resolved !== undefined) {
            return resolved;
        }
    }
    return undefined;
}

function wildcardTargets(specifier: string, aliases: readonly PathAlias[]): string[] {
    const matches = aliases.flatMap(({ pattern, targets }) => {
        const star = pattern.indexOf("*");
        if (star < 0) {
            return [];
        }
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
            return [];
        }
        const captured = specifier.slice(prefix.length, specifier.length - suffix.length);
        return [{ prefix, targets: targets.map((target) => target.replaceAll("*", captured)) }];
    });
    const longest = matches.sort((left, right) => right.prefix.length - left.prefix.length)[0];
    return longest?.targets ?? [];
}
