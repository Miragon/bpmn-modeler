// The path globs of the .github registries: `**` crosses folders, `*` stays
// within one, nothing else is a wildcard.

export function globToRegExp(glob) {
    const pattern = glob
        .replace(/[.+^${}()|[\]\\?]/g, "\\$&")
        .replace(/\*\*\/|\*\*|\*/g, (wildcard) =>
            wildcard === "**/" ? "(?:.*/)?" : wildcard === "**" ? ".*" : "[^/]*",
        );
    return new RegExp(`^${pattern}$`);
}

/** A glob that starts with `!` takes back what the others match. */
export function matchesGlobs(globs, path) {
    const excluded = globs.filter((glob) => glob.startsWith("!"));
    const included = globs.filter((glob) => !glob.startsWith("!"));
    return (
        included.some((glob) => globToRegExp(glob).test(path)) &&
        !excluded.some((glob) => globToRegExp(glob.slice(1)).test(path))
    );
}
