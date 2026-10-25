function escapeRegExpLiteral(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles a workspace glob into a path-matching `RegExp`, for hosts whose file
 * APIs cannot match the glob themselves.
 *
 * Supports the operators the core's globs use: a double-star (across path
 * segments, with a trailing slash swallowed so a leading double-star also
 * matches at the root), single `*` / `?` within one segment, and `{a,b,c}` brace
 * alternation — the code-link source glob (extensions `{java,kt,…}`) needs the
 * last one.
 */
export function globToRegExp(glob: string): RegExp {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*" && glob[i + 1] === "*") {
            re += ".*";
            i++;
            if (glob[i + 1] === "/") i++;
        } else if (c === "*") {
            re += "[^/]*";
        } else if (c === "?") {
            re += "[^/]";
        } else if (c === "{") {
            // An unterminated brace degrades to a literal so a stray `{` can't produce an invalid regex.
            const end = glob.indexOf("}", i);
            if (end === -1) {
                re += "\\{";
            } else {
                const alternatives = glob.slice(i + 1, end).split(",");
                re += `(?:${alternatives.map(escapeRegExpLiteral).join("|")})`;
                i = end;
            }
        } else {
            re += escapeRegExpLiteral(c);
        }
    }
    return new RegExp(`^${re}$`);
}
