interface KotlinString {
    readonly kind: "string";
    readonly line: number;
    /** The literal stretches around the placeholders, in order, escapes decoded. */
    readonly parts: readonly string[];
    /** One per placeholder: the name of `$name`, the code inside `${…}`. */
    readonly placeholders: readonly (readonly KotlinToken[])[];
}

export interface KotlinCodeToken {
    /** A value is a number or a character literal. */
    readonly kind: "name" | "symbol" | "value";
    readonly text: string;
    readonly line: number;
}

export type KotlinToken = KotlinCodeToken | KotlinString;

const IDENTIFIER_START = /[\p{L}_]/u;
const IDENTIFIER_PART = /[\p{L}\p{Nd}_]/u;
const DIGIT = /[0-9]/;
const NUMBER_PART = /[0-9a-zA-Z_]/;
const WHITESPACE = /\s/;
const ESCAPES: Readonly<Record<string, string>> = { t: "\t", b: "\b", n: "\n", r: "\r" };
const RAW_QUOTES = '"""';
// `?.` calls like `.`; `->` is no `>` closing type arguments, and `::class` declares no class.
const COMPOUND_SYMBOLS: Readonly<Record<string, string>> = { "?.": ".", "->": "->", "::": "::" };

class KotlinScanner {
    private position = 0;
    private line = 1;

    constructor(private readonly text: string) {}

    /** Inside a placeholder, the code ends at the `}` that closes it. */
    code(insidePlaceholder: boolean): KotlinToken[] {
        const tokens: KotlinToken[] = [];
        let braces = 0;
        while (this.position < this.text.length) {
            const char = this.text.charAt(this.position);
            if (insidePlaceholder && char === "}" && braces === 0) {
                this.advance(1);
                return tokens;
            }
            braces += char === "{" ? 1 : char === "}" ? -1 : 0;
            const token = this.token(char);
            if (token !== undefined) {
                tokens.push(token);
            }
        }
        return tokens;
    }

    // Whitespace and comments are no token.
    private token(char: string): KotlinToken | undefined {
        if (WHITESPACE.test(char)) {
            this.advance(1);
            return undefined;
        }
        if (this.startsWith("//")) {
            this.skipLineComment();
            return undefined;
        }
        if (this.startsWith("/*")) {
            this.skipBlockComment();
            return undefined;
        }
        if (this.atString()) {
            return this.string();
        }
        if (char === "'") {
            return this.character();
        }
        if (char === "`" || IDENTIFIER_START.test(char)) {
            return this.name();
        }
        return DIGIT.test(char) ? this.number() : this.symbol();
    }

    private startsWith(prefix: string): boolean {
        return this.text.startsWith(prefix, this.position);
    }

    private advance(count: number): void {
        for (const char of this.text.slice(this.position, this.position + count)) {
            this.line += char === "\n" ? 1 : 0;
        }
        this.position += count;
    }

    private skipLineComment(): void {
        const end = this.text.indexOf("\n", this.position);
        this.position = end === -1 ? this.text.length : end;
    }

    // Kotlin block comments nest.
    private skipBlockComment(): void {
        let depth = 0;
        while (this.position < this.text.length) {
            if (this.startsWith("/*")) {
                depth += 1;
                this.advance(2);
            } else if (this.startsWith("*/")) {
                depth -= 1;
                this.advance(2);
                if (depth === 0) {
                    return;
                }
            } else {
                this.advance(1);
            }
        }
    }

    private runOf(char: string): number {
        let run = 0;
        while (this.text.charAt(this.position + run) === char) {
            run += 1;
        }
        return run;
    }

    // A multi-dollar string, `$$"…"`, needs that many dollars before a placeholder.
    private atString(): boolean {
        return this.text.charAt(this.position + this.runOf("$")) === '"';
    }

    private string(): KotlinString {
        const line = this.line;
        const prefix = this.runOf("$");
        const dollars = Math.max(1, prefix);
        this.position += prefix;
        const raw = this.startsWith(RAW_QUOTES);
        this.advance(raw ? 3 : 1);
        const parts: string[] = [];
        const placeholders: KotlinToken[][] = [];
        let part = "";
        while (this.position < this.text.length) {
            const char = this.text.charAt(this.position);
            if (raw ? this.startsWith(RAW_QUOTES) : char === '"') {
                // In a run of three or more quotes the last three close a raw string; the others are text.
                const quotes = raw ? this.runOf('"') : 1;
                part += '"'.repeat(quotes - (raw ? 3 : 1));
                this.advance(quotes);
                break;
            }
            if (!raw && char === "\n") {
                break;
            }
            if (!raw && char === "\\") {
                part += this.escape();
                continue;
            }
            const placeholder = char === "$" ? this.placeholder(dollars) : undefined;
            if (placeholder === undefined) {
                part += char;
                this.advance(1);
                continue;
            }
            parts.push(part + placeholder.text);
            placeholders.push(placeholder.tokens);
            part = "";
        }
        parts.push(part);
        return { kind: "string", line, parts, placeholders };
    }

    private escape(): string {
        const code = this.text.charAt(this.position + 1);
        if (code === "u") {
            const unit = Number.parseInt(this.text.slice(this.position + 2, this.position + 6), 16);
            this.advance(6);
            return String.fromCharCode(unit);
        }
        this.advance(2);
        return ESCAPES[code] ?? code;
    }

    // A placeholder takes the last `dollars` of a dollar run before a name or `{`; the dollars before them are text.
    private placeholder(dollars: number): { text: string; tokens: KotlinToken[] } | undefined {
        const run = this.runOf("$");
        const next = this.text.charAt(this.position + run);
        if (run < dollars || !(next === "{" || next === "`" || IDENTIFIER_START.test(next))) {
            return undefined;
        }
        const text = "$".repeat(run - dollars);
        this.advance(run);
        if (next === "{") {
            this.advance(1);
            return { text, tokens: this.code(true) };
        }
        return { text, tokens: [this.name()] };
    }

    private character(): KotlinCodeToken {
        const line = this.line;
        const start = this.position;
        const afterFirst = this.position + (this.text.charAt(this.position + 1) === "\\" ? 3 : 2);
        const close = this.text.indexOf("'", afterFirst);
        this.advance((close === -1 ? this.text.length : close + 1) - start);
        return { kind: "value", text: this.text.slice(start, this.position), line };
    }

    private name(): KotlinCodeToken {
        const line = this.line;
        if (this.text.charAt(this.position) === "`") {
            const close = this.text.indexOf("`", this.position + 1);
            const end = close === -1 ? this.text.length : close;
            const text = this.text.slice(this.position + 1, end);
            this.advance(end + 1 - this.position);
            return { kind: "name", text, line };
        }
        const start = this.position;
        this.position += 1;
        this.skipWhile(IDENTIFIER_PART);
        return { kind: "name", text: this.text.slice(start, this.position), line };
    }

    // `1.5e3` is one value, `1..9` a range of two.
    private number(): KotlinCodeToken {
        const start = this.position;
        this.skipWhile(NUMBER_PART);
        if (
            this.text.charAt(this.position) === "." &&
            DIGIT.test(this.text.charAt(this.position + 1))
        ) {
            this.position += 1;
            this.skipWhile(NUMBER_PART);
        }
        return { kind: "value", text: this.text.slice(start, this.position), line: this.line };
    }

    private skipWhile(pattern: RegExp): void {
        while (pattern.test(this.text.charAt(this.position))) {
            this.position += 1;
        }
    }

    private symbol(): KotlinCodeToken {
        const line = this.line;
        const pair = this.text.slice(this.position, this.position + 2);
        const compound = COMPOUND_SYMBOLS[pair];
        if (compound !== undefined) {
            this.position += 2;
            return { kind: "symbol", text: compound, line };
        }
        const text = this.text.charAt(this.position);
        this.position += 1;
        return { kind: "symbol", text, line };
    }
}

/**
 * Kotlin source as tokens, without whitespace and comments. A string is one
 * token whose placeholders hold their own tokens, so quotes and braces inside
 * `${…}` never end the string around them. Reads no types.
 */
export function lexKotlin(text: string): KotlinToken[] {
    return new KotlinScanner(text).code(false);
}
