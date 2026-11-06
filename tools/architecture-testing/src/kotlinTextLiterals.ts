import { type KotlinToken, lexKotlin } from "./kotlinLexer";
import type { CallSite, TextLiteral } from "./textLiterals";

// A parenthesis after these is a condition, a parameter list or a grouping, never a call.
const NOT_CALLED: ReadonlySet<string> = new Set([
    "if",
    "while",
    "for",
    "when",
    "catch",
    "return",
    "in",
    "is",
    "as",
    "else",
    "throw",
    "fun",
    "constructor",
]);
const NOT_RECEIVERS: ReadonlySet<string> = new Set(["this", "super"]);
const DECLARES_PARAMETERS: ReadonlySet<string> = new Set(["fun", "class"]);
const TYPE_ARGUMENT_SYMBOLS: ReadonlySet<string> = new Set([",", ".", "?", "*"]);
interface BracketPair {
    readonly opener: string;
    readonly closer: string;
}

const ANGLE_BRACKETS: BracketPair = { opener: "<", closer: ">" };
const PARENTHESES: BracketPair = { opener: "(", closer: ")" };
const CLOSERS: ReadonlyMap<string, string> = new Map([
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
]);

function isSymbol(token: KotlinToken | undefined, text: string): boolean {
    return token?.kind === "symbol" && token.text === text;
}

function nameAt(tokens: readonly KotlinToken[], index: number): string | undefined {
    const token = tokens[index];
    return token?.kind === "name" ? token.text : undefined;
}

// `A::class` names a class; it declares none.
function keywordAt(tokens: readonly KotlinToken[], index: number): string | undefined {
    return isSymbol(tokens[index - 1], "::") ? undefined : nameAt(tokens, index);
}

function isTypeArgumentToken(token: KotlinToken): boolean {
    return (
        token.kind === "name" || (token.kind === "symbol" && TYPE_ARGUMENT_SYMBOLS.has(token.text))
    );
}

function acceptsAnyToken(): boolean {
    return true;
}

/** The opener of the brackets that close at `closeIndex`, if every token between them is accepted. */
function openerOf(
    tokens: readonly KotlinToken[],
    closeIndex: number,
    { opener, closer }: BracketPair,
    accepts: (token: KotlinToken) => boolean = acceptsAnyToken,
): number | undefined {
    let depth = 0;
    for (let index = closeIndex; index >= 0; index -= 1) {
        const token = tokens[index];
        if (isSymbol(token, closer)) {
            depth += 1;
        } else if (isSymbol(token, opener)) {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        } else if (!accepts(token)) {
            return undefined;
        }
    }
    return undefined;
}

/** The `<` that opens the type arguments a `>` before a `(` closes; unset when the `>` compares. */
function typeArgumentsStart(
    tokens: readonly KotlinToken[],
    closeIndex: number,
): number | undefined {
    return openerOf(tokens, closeIndex, ANGLE_BRACKETS, isTypeArgumentToken);
}

// Before a `.` or a declared name, a `>` closes a receiver type or type parameters, whose bounds may hold any token: `<T : suspend () -> Unit>`.
function skipAngleBrackets(tokens: readonly KotlinToken[], index: number): number {
    return isSymbol(tokens[index], ">")
        ? (openerOf(tokens, index, ANGLE_BRACKETS) ?? 0) - 1
        : index;
}

/** The name a `(` calls, past its type arguments: `of` in `Pair.of<A, B>(`. */
function calleeBefore(tokens: readonly KotlinToken[], openIndex: number): number | undefined {
    const start = isSymbol(tokens[openIndex - 1], ">")
        ? typeArgumentsStart(tokens, openIndex - 1)
        : openIndex;
    return start === undefined ? undefined : start - 1;
}

/** The index of what a `.` before `index` is called on: `a!!.b`, `List<T>.b`. */
function targetBeforeDot(tokens: readonly KotlinToken[], index: number): number | undefined {
    if (!isSymbol(tokens[index - 1], ".")) {
        return undefined;
    }
    let target = index - 2;
    while (isSymbol(tokens[target], "!")) {
        target -= 1;
    }
    return target;
}

/** What a `.` before `calleeIndex` calls on: `log` in `log!!.warn`, the callee `thisLogger` in `thisLogger().warn`. */
function receiverOf(tokens: readonly KotlinToken[], calleeIndex: number): string | undefined {
    const target = targetBeforeDot(tokens, calleeIndex);
    if (target === undefined) {
        return undefined;
    }
    if (!isSymbol(tokens[target], ")")) {
        return nameAt(tokens, target);
    }
    const open = openerOf(tokens, target, PARENTHESES);
    const callee = open === undefined ? undefined : calleeBefore(tokens, open);
    return callee === undefined ? undefined : nameAt(tokens, callee);
}

/** The first name of the chain `a.b.c` that ends at `calleeIndex`. */
function chainStart(tokens: readonly KotlinToken[], calleeIndex: number): number {
    let start = calleeIndex;
    for (;;) {
        const target = targetBeforeDot(tokens, start);
        const name = target === undefined ? undefined : skipAngleBrackets(tokens, target);
        if (name === undefined || nameAt(tokens, name) === undefined) {
            return start;
        }
        start = name;
    }
}

function namedCall(tokens: readonly KotlinToken[], calleeIndex: number): CallSite | undefined {
    const callee = nameAt(tokens, calleeIndex);
    if (callee === undefined || NOT_CALLED.has(callee)) {
        return undefined;
    }
    const keyword = keywordAt(
        tokens,
        skipAngleBrackets(tokens, chainStart(tokens, calleeIndex) - 1),
    );
    if (keyword !== undefined && DECLARES_PARAMETERS.has(keyword)) {
        return undefined;
    }
    const receiver = receiverOf(tokens, calleeIndex);
    return {
        construct: false,
        callee,
        ...(receiver === undefined || NOT_RECEIVERS.has(receiver) ? {} : { receiver }),
        ...(keyword === "throw" ? { thrown: true } : {}),
    };
}

function callOpenedBy(tokens: readonly KotlinToken[], index: number): CallSite | undefined {
    const before = tokens[index - 1];
    if (isSymbol(before, ")") || isSymbol(before, "]")) {
        return { construct: false };
    }
    const calleeIndex = calleeBefore(tokens, index);
    return calleeIndex === undefined ? undefined : namedCall(tokens, calleeIndex);
}

interface Bracket {
    readonly closer: string;
    readonly call: CallSite | undefined;
}

// A brace opens a lambda, a block or a body: code a callee runs is no value it is handed.
function callsAround(outerCalls: readonly CallSite[], open: readonly Bracket[]): CallSite[] {
    const lastBrace = open.map(({ closer }) => closer).lastIndexOf("}");
    const calls = open
        .slice(lastBrace + 1)
        .flatMap(({ call }) => (call === undefined ? [] : [call]));
    return lastBrace === -1 ? [...outerCalls, ...calls] : calls;
}

function readTokens(
    tokens: readonly KotlinToken[],
    outerCalls: readonly CallSite[],
    literals: TextLiteral[],
): void {
    const open: Bracket[] = [];
    tokens.forEach((token, index) => {
        if (token.kind === "string") {
            const argumentOf = callsAround(outerCalls, open);
            literals.push({ line: token.line, parts: token.parts, argumentOf });
            token.placeholders.forEach((placeholder) =>
                readTokens(placeholder, argumentOf, literals),
            );
            return;
        }
        const closer = token.kind === "symbol" ? CLOSERS.get(token.text) : undefined;
        if (closer !== undefined) {
            const call = token.text === "(" ? callOpenedBy(tokens, index) : undefined;
            open.push({ closer, call });
        } else if (open[open.length - 1]?.closer === token.text) {
            open.pop();
        }
    });
}

/**
 * The string literals and templates of Kotlin source, raw strings included,
 * with the calls whose arguments hold them up to the nearest brace. A callee
 * is the name before its `(`, a receiver the name or the callee before its
 * `.`; Kotlin has no `new`, so a call that `throw` raises is marked thrown.
 * Tokens only: no types are read.
 */
export function readKotlinTextLiterals(text: string): TextLiteral[] {
    const literals: TextLiteral[] = [];
    readTokens(lexKotlin(text), [], literals);
    return literals;
}
