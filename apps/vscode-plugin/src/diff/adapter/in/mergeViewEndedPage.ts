const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/**
 * The page of a merge pane whose merge view no longer exists, as after a
 * window reload: the core's text, no script, no diagram.
 */
export function mergeViewEndedPage(text: string): string {
    const escaped = text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
body { display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;
    font-family: var(--vscode-font-family); color: var(--vscode-descriptionForeground);
    background: var(--vscode-editor-background); }
</style>
</head>
<body><main data-merge-view-ended>${escaped}</main></body>
</html>`;
}
