/** Reads CRLF and lone CR as LF, so a host's EOL setting never tells two contents apart. */
export function normalizeLineEndings(content: string): string {
    return content.replace(/\r\n?/g, "\n");
}
