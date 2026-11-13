import type { SourceFile } from "@miragon/architecture-testing";

const STAGING_LITERAL = /["'`][^"'`\n]*\bdist\/webview-staging\/([^/"'`\s]+)/g;
const QUOTES = `"'\``;

/** Drops comments outside string literals and keeps their line breaks. */
function withoutComments(source: string): string {
    let result = "";
    let openQuote: string | undefined;
    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        if (openQuote !== undefined) {
            result += char;
            if (char === "\\") {
                result += source[++index] ?? "";
            } else if (char === openQuote) {
                openQuote = undefined;
            }
        } else if (source.startsWith("//", index)) {
            const lineEnd = source.indexOf("\n", index);
            index = (lineEnd === -1 ? source.length : lineEnd) - 1;
        } else if (source.startsWith("/*", index)) {
            const commentEnd = source.indexOf("*/", index + 2);
            const end = commentEnd === -1 ? source.length : commentEnd + 2;
            result += source.slice(index, end).replace(/[^\n]/g, "");
            index = end - 1;
        } else {
            if (QUOTES.includes(char)) {
                openQuote = char;
            }
            result += char;
        }
    }
    return result;
}

/** The distinct first folders below `dist/webview-staging/` that a host build's literals name. */
export function stagingFolders(buildFile: SourceFile): string[] {
    const folders = [...withoutComments(buildFile.text).matchAll(STAGING_LITERAL)].map(
        ([, folder]) => folder,
    );
    if (folders.length === 0) {
        throw new Error(`${buildFile.path} copies no dist/webview-staging/<folder>`);
    }
    return [...new Set(folders)];
}

/** Undefined for a Vite build that writes elsewhere: that app is no webview. */
export function viteStagingFolder(viteConfig: SourceFile): string | undefined {
    return /\boutDir:\s*["'`](?:\.\.\/)*dist\/webview-staging\/([^/"'`]+)["'`]/.exec(
        viteConfig.text,
    )?.[1];
}
