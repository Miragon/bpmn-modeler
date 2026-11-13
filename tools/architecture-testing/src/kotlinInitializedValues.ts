import { type KotlinToken, lexKotlin } from "./kotlinLexer";

export interface KotlinInitializedValue {
    readonly name: string;
    /** The called name with its qualifiers: `Logger.getInstance`. */
    readonly initializer: string;
}

const DECLARES_VALUE: ReadonlySet<string> = new Set(["val", "var"]);
// A parenthesis after these opens a condition, never a call.
const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set(["if", "when", "try", "object"]);
const OPENERS: ReadonlySet<string> = new Set(["(", "[", "{", "<"]);
const CLOSERS: ReadonlySet<string> = new Set([")", "]", "}", ">"]);
const ENDS_DECLARATION: ReadonlySet<string> = new Set([",", ";"]);
const PARENTHESES = ["(", ")"] as const;
const ANGLE_BRACKETS = ["<", ">"] as const;

function isSymbol(token: KotlinToken | undefined, text: string): boolean {
    return token?.kind === "symbol" && token.text === text;
}

function nameAt(tokens: readonly KotlinToken[], index: number): string | undefined {
    const token = tokens[index];
    return token?.kind === "name" ? token.text : undefined;
}

/** The index past the bracket that closes the one opened at `openIndex`; only its own kind nests, so `(a < b)` closes. */
function pastClosing(
    tokens: readonly KotlinToken[],
    openIndex: number,
    [opener, closer]: readonly [string, string],
): number | undefined {
    let depth = 0;
    for (let index = openIndex; index < tokens.length; index += 1) {
        if (isSymbol(tokens[index], opener)) {
            depth += 1;
        } else if (isSymbol(tokens[index], closer)) {
            depth -= 1;
            if (depth === 0) {
                return index + 1;
            }
        }
    }
    return undefined;
}

/** The `=` after a declared name, past its type; a type with no `=` on its line declares no value. */
function assignmentAfter(tokens: readonly KotlinToken[], start: number): number | undefined {
    if (isSymbol(tokens[start], "=")) {
        return start;
    }
    if (!isSymbol(tokens[start], ":")) {
        return undefined;
    }
    const line = tokens[start].line;
    let depth = 0;
    for (let index = start + 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (depth === 0 && token.line !== line) {
            return undefined;
        }
        if (token.kind !== "symbol") {
            continue;
        }
        if (OPENERS.has(token.text)) {
            depth += 1;
        } else if (CLOSERS.has(token.text)) {
            if (depth === 0) {
                return undefined;
            }
            depth -= 1;
        } else if (depth === 0 && token.text === "=") {
            return index;
        } else if (depth === 0 && ENDS_DECLARATION.has(token.text)) {
            return undefined;
        }
    }
    return undefined;
}

/** `a.b.c` when the expression at `start` is the call `a.b.c(…)` and nothing more. */
function calledChain(tokens: readonly KotlinToken[], start: number): string | undefined {
    const names: string[] = [];
    let index = start;
    for (let name = nameAt(tokens, index); name !== undefined; name = nameAt(tokens, index)) {
        names.push(name);
        if (!isSymbol(tokens[index + 1], ".")) {
            break;
        }
        index += 2;
    }
    if (names.length === 0 || EXPRESSION_KEYWORDS.has(names[0])) {
        return undefined;
    }
    const open = isSymbol(tokens[index + 1], "<")
        ? pastClosing(tokens, index + 1, ANGLE_BRACKETS)
        : index + 1;
    if (open === undefined || !isSymbol(tokens[open], "(")) {
        return undefined;
    }
    const end = pastClosing(tokens, open, PARENTHESES);
    return end === undefined || isSymbol(tokens[end], ".") ? undefined : names.join(".");
}

/**
 * The `val` and `var` declarations of Kotlin source whose value is one call,
 * a constructor property's default included, with the name they call. Tokens
 * only: what the call returns is not resolved.
 */
export function readKotlinInitializedValues(text: string): KotlinInitializedValue[] {
    const tokens = lexKotlin(text);
    return tokens.flatMap((token, index): KotlinInitializedValue[] => {
        const name = nameAt(tokens, index + 1);
        if (token.kind !== "name" || !DECLARES_VALUE.has(token.text) || name === undefined) {
            return [];
        }
        const assignment = assignmentAfter(tokens, index + 2);
        const initializer =
            assignment === undefined ? undefined : calledChain(tokens, assignment + 1);
        return initializer === undefined ? [] : [{ name, initializer }];
    });
}
