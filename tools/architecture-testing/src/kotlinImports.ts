import { type KotlinCodeToken, type KotlinToken, lexKotlin } from "./kotlinLexer";

const OPENERS: ReadonlySet<string> = new Set(["(", "[", "{"]);
const CLOSERS: ReadonlySet<string> = new Set([")", "]", "}"]);

function isSemicolon(token: KotlinToken): boolean {
    return token.kind === "symbol" && token.text === ";";
}

function endsImport(token: KotlinCodeToken): boolean {
    return (token.kind === "name" && token.text === "as") || isSemicolon(token);
}

function startsStatement(tokens: readonly KotlinToken[], index: number): boolean {
    const previous = tokens[index - 1];
    return previous === undefined || previous.line !== tokens[index].line || isSemicolon(previous);
}

function importedName(tokens: readonly KotlinToken[], start: number, line: number): string {
    let name = "";
    for (let index = start; tokens[index]?.line === line; index += 1) {
        const token = tokens[index];
        if (token.kind === "string" || endsImport(token)) {
            break;
        }
        name += token.text;
    }
    return name;
}

/**
 * The names a Kotlin file imports, `com.intellij.ui.dsl.builder.*` included,
 * without an alias. `import` is a soft keyword, so only one that starts a line
 * or follows a `;` outside any bracket starts an import; comments and strings
 * never do.
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
        const isImport = token.kind === "name" && token.text === "import";
        if (depth === 0 && isImport && startsStatement(tokens, index)) {
            imports.push(importedName(tokens, index + 1, token.line));
        }
    });
    return imports.filter((name) => name !== "");
}
