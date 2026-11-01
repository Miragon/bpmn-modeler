import { escapeRegExpLiteral } from "./escapeRegExpLiteral";

/**
 * Compiles a workspace glob into a path-matching `RegExp`, for hosts whose file
 * APIs cannot match the glob themselves.
 *
 * Supports the operators the core's globs use: a double-star followed by a slash
 * (zero or more whole path segments, as ripgrep and `fs.glob` match it), a bare
 * double-star (anything, across segments), single `*` / `?` within one segment,
 * and `{a,b,c}` brace alternation — the code-link source glob (extensions
 * `{java,kt,…}`) needs the last one.
 */
export function globToRegExp(glob: string): RegExp {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*" && glob[i + 1] === "*") {
            i++;
            if (glob[i + 1] === "/") {
                re += "(?:.*/)?";
                i++;
            } else {
                re += ".*";
            }
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

const WHOLE_FOLDER_SUFFIX = "/**";

/**
 * Matches the relative path of each folder whose every file `glob` matches,
 * so a walk can skip reading it; `undefined` when `glob` covers no folder
 * whole. Only a glob ending in a slash and a double-star does: its head names
 * the folder.
 */
export function coveredFolderRegExp(glob: string): RegExp | undefined {
    return glob.endsWith(WHOLE_FOLDER_SUFFIX)
        ? globToRegExp(glob.slice(0, -WHOLE_FOLDER_SUFFIX.length))
        : undefined;
}
