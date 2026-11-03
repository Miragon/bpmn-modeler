/**
 * Splits a decoded stdin stream into newline-delimited lines. Only each newly
 * arrived chunk is scanned for `\n`; a partial line is kept as a chunk list and
 * joined once its terminator arrives, so a multi-MB frame split into many chunks
 * costs linear rather than quadratic time.
 */
export function createLineSplitter(onLine: (line: string) => void): (chunk: string) => void {
    let pendingChunks: string[] = [];

    return (chunk: string) => {
        let lineStart = 0;
        let newline = chunk.indexOf("\n");
        while (newline >= 0) {
            const lineTail = chunk.slice(lineStart, newline);
            if (pendingChunks.length > 0) {
                pendingChunks.push(lineTail);
                const line = pendingChunks.join("");
                pendingChunks = [];
                onLine(line);
            } else {
                onLine(lineTail);
            }
            lineStart = newline + 1;
            newline = chunk.indexOf("\n", lineStart);
        }
        if (lineStart < chunk.length) {
            pendingChunks.push(chunk.slice(lineStart));
        }
    };
}
