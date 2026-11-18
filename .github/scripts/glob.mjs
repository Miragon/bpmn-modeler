// The path globs of the .github registries: `**` crosses folders, `*` stays
// within one, `{a,b}` matches either alternative, nothing else is a wildcard.

export function globToRegExp(glob) {
    let pattern = "";
    let braceDepth = 0;
    for (let index = 0; index < glob.length; index++) {
        const char = glob[index];
        if (char === "*" && glob[index + 1] === "*") {
            const slashFollows = glob[index + 2] === "/";
            pattern += slashFollows ? "(?:.*/)?" : ".*";
            index += slashFollows ? 2 : 1;
        } else if (char === "*") pattern += "[^/]*";
        else if (char === "{") {
            braceDepth++;
            pattern += "(?:";
        } else if (char === "}" && braceDepth > 0) {
            braceDepth--;
            pattern += ")";
        } else if (char === "," && braceDepth > 0) pattern += "|";
        else pattern += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
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
