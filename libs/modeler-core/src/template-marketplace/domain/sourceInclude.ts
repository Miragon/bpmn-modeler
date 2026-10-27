import { matchesGlob } from "./glob";

/**
 * The listed files a source contributes: all of them without `include`,
 * otherwise those whose subtree-relative path matches one of its globs.
 *
 * The kept entries stay the *full* listed paths, so the cache key is the path
 * the adapter reported. `subtreePath` is the config's path, not the source's: a
 * `provider: "local"` source resolves to `""` while its adapter lists
 * subtree-relative paths. A listed path lacking the prefix is matched whole
 * rather than dropped, so a prefix mismatch never silently swallows a template.
 */
export function includedFiles(
    listed: readonly string[],
    subtreePath: string,
    include: readonly string[] | undefined,
): readonly string[] {
    if (include === undefined) {
        return listed;
    }
    return listed.filter((repoPath) =>
        include.some((pattern) => matchesGlob(pattern, subtreeRelative(repoPath, subtreePath))),
    );
}

function subtreeRelative(repoPath: string, subtreePath: string): string {
    const prefix = `${subtreePath}/`;
    return subtreePath !== "" && repoPath.startsWith(prefix)
        ? repoPath.slice(prefix.length)
        : repoPath;
}
