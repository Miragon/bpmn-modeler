import {
    ANGLE_BRACKETS,
    BRACKET_CLOSERS,
    type BracketPair,
    type KotlinToken,
    lexKotlin,
    PARENTHESES,
} from "./kotlinLexer";

export interface KotlinInitializedValue {
    readonly name: string;
    /** The called name with its qualifiers: `Logger.getInstance`. */
    readonly initializer: string;
}

const DECLARES_VALUE: ReadonlySet<string> = new Set(["val", "var"]);
// A parenthesis after these opens a condition, never a call.
const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set(["if", "when", "try", "object"]);
const TYPE_OPENERS: ReadonlySet<string> = new Set([
    ...BRACKET_CLOSERS.keys(),
    ANGLE_BRACKETS.opener,
]);
const TYPE_CLOSERS: ReadonlySet<string> = new Set([
    ...BRACKET_CLOSERS.values(),
    ANGLE_BRACKETS.closer,
]);
const ENDS_DECLARATION: ReadonlySet<string> = new Set([",", ";"]);

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
    { opener, closer }: BracketPair,
): number | undefined {
    let depth = 0;
    for (let index = openIndex; index < tokens.length; index += 1) {
        depth += isSymbol(tokens[index], opener) ? 1 : isSymbol(tokens[index], closer) ? -1 : 0;
        if (depth === 0) {
            return index + 1;
        }
    }
    return undefined;
}

function typeDepthChange(token: KotlinToken): number {
    if (token.kind !== "symbol") {
        return 0;
    }
    return TYPE_OPENERS.has(token.text) ? 1 : TYPE_CLOSERS.has(token.text) ? -1 : 0;
}

/** The `=` after a type; outside its brackets a type ends at its line, a `,` or `;`, or a bracket it did not open. */
function assignmentAfterType(tokens: readonly KotlinToken[], start: number): number | undefined {
    const line = tokens[start - 1].line;
    let depth = 0;
    for (let index = start; index < tokens.length; index += 1) {
        const token = tokens[index];
        const outside = depth === 0;
        if (outside && isSymbol(token, "=")) {
            return index;
        }
        depth += typeDepthChange(token);
        const endsType =
            token.line !== line ||
            depth < 0 ||
            (token.kind === "symbol" && ENDS_DECLARATION.has(token.text));
        if (outside && endsType) {
            return undefined;
        }
    }
    return undefined;
}

function assignmentAfter(tokens: readonly KotlinToken[], start: number): number | undefined {
    if (isSymbol(tokens[start], "=")) {
        return start;
    }
    return isSymbol(tokens[start], ":") ? assignmentAfterType(tokens, start + 1) : undefined;
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
    const open = isSymbol(tokens[index + 1], ANGLE_BRACKETS.opener)
        ? pastClosing(tokens, index + 1, ANGLE_BRACKETS)
        : index + 1;
    if (open === undefined || !isSymbol(tokens[open], PARENTHESES.opener)) {
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
