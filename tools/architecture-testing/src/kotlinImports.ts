import { type KotlinToken, lexKotlin } from "./kotlinLexer";

const OPENERS: ReadonlySet<string> = new Set(["(", "[", "{"]);
const CLOSERS: ReadonlySet<string> = new Set([")", "]", "}"]);

function importedName(tokens: readonly KotlinToken[], start: number, line: number): string {
    let name = "";
    for (let index = start; tokens[index]?.line === line; index += 1) {
        const token = tokens[index];
        if (token.kind === "string" || (token.kind === "name" && token.text === "as")) {
            break;
        }
        name += token.text;
    }
    return name;
}

/**
 * The names a Kotlin file imports, `com.intellij.ui.dsl.builder.*` included,
 * without an alias. `import` is a soft keyword, so only one that starts a line
 * outside any bracket starts an import; comments and strings never do.
 */
export function readKotlinImports(text: string): string[] {
    const tokens = lexKotlin(text);
    const imports: string[] = [];
    let depth = 0;
    tokens.forEach((token, index) => {
        if (token.kind === "symbol") {
            depth += OPENERS.has(token.text) ? 1 : CLOSERS.has(token.text) ? -1 : 0;
            return;
        }
        const startsLine = tokens[index - 1]?.line !== token.line;
        if (depth === 0 && startsLine && token.kind === "name" && token.text === "import") {
            imports.push(importedName(tokens, index + 1, token.line));
        }
    });
    return imports.filter((name) => name !== "");
}
