import type { SourceFile } from "@miragon/architecture-testing";

const STAGING_LITERAL = /["'`][^"'`\n]*\bdist\/webview-staging\/([^/"'`\s]+)/g;
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/;

/** The distinct first folders below `dist/webview-staging/` that a host build's literals name. */
export function stagingFolders(buildFile: SourceFile): string[] {
    const folders = buildFile.text
        .split("\n")
        .filter((line) => !COMMENT_LINE.test(line))
        .flatMap((line) => [...line.matchAll(STAGING_LITERAL)].map(([, folder]) => folder));
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
