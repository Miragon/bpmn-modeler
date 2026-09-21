/**
 * Minimal `.env` parser: `KEY=VALUE` lines, `#` comments, an optional `export `
 * prefix, single/double-quote stripping, and CRLF tolerance. A later assignment
 * of the same key wins. Deliberately dependency-free — the modeler ships no
 * dotenv package and this covers the credential-ref use case.
 */
export function parseDotEnv(content: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith("#")) {
            continue;
        }

        const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
        const separator = withoutExport.indexOf("=");
        if (separator <= 0) {
            continue;
        }

        const key = withoutExport.slice(0, separator).trim();
        if (key.length === 0) {
            continue;
        }

        result[key] = stripQuotes(withoutExport.slice(separator + 1).trim());
    }

    return result;
}

function stripQuotes(value: string): string {
    if (value.length >= 2) {
        const first = value[0];
        if ((first === '"' || first === "'") && value[value.length - 1] === first) {
            return value.slice(1, -1);
        }
    }
    return value;
}
