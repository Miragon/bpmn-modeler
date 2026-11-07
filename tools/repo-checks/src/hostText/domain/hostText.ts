import { type Finding, sortFindings } from "../../fitness/domain/finding";

/** What makes a file host code: the modules it imports and the files declaring the interfaces its classes implement. */
export interface SourceDependencies {
    readonly path: string;
    readonly importedSpecifiers: readonly string[];
    readonly implementedInterfaceFiles: readonly string[];
}

/** A call or `new` whose arguments hold a text: `this.logger.info` calls `info` on `logger`. */
export interface CallSite {
    readonly construct: boolean;
    readonly callee?: string;
    readonly receiver?: string;
    /** Kotlin, which constructs without `new`: the call is what a `throw` raises. */
    readonly thrown?: boolean;
}

export interface WrittenText {
    readonly line: number;
    /** One for a plain literal; a template's literal stretches around its placeholders. */
    readonly parts: readonly string[];
    readonly argumentOf: readonly CallSite[];
}

export interface HostFileTexts {
    readonly path: string;
    readonly texts: readonly WrittenText[];
}

const TYPESCRIPT_SOURCE = /\.([mc]?ts|tsx)$/;
// Specs and fixtures are inputs of tests, and a declaration file only types code; none of them is host code.
const UNSCANNED_TYPESCRIPT = /\.(spec|test)\.[^/]+$|(^|\/)__fixtures__\/|\.d\.[mc]?ts$/;
// Gradle's main source set; its tests sit in src/test/kotlin.
const KOTLIN_SOURCE = /(^|\/)src\/main\/kotlin\/.+\.kt$/;
const VSCODE_API = "vscode";
const INTELLIJ_PLATFORM_API = "com.intellij.";
const CORE_DIR = "libs/modeler-core/";
// A word holds a letter or a digit, so punctuation around whitespace, such as `:root {` or `, '*');`, is none.
const WORD = /[\p{L}\p{N}]/u;
const WHITESPACE = /\s+/;
const LOGGING_CALLEE = /^log(?![a-z])/;
const LOGGING_RECEIVERS: ReadonlySet<string> = new Set([
    "log",
    "LOG",
    "logger",
    "thisLogger",
    "console",
]);
const PLACEHOLDER = "${…}";
const MESSAGE_LENGTH = 100;

export function isKotlinSource(path: string): boolean {
    return KOTLIN_SOURCE.test(path);
}

export function isScannedSource(path: string): boolean {
    return (
        isKotlinSource(path) || (TYPESCRIPT_SOURCE.test(path) && !UNSCANNED_TYPESCRIPT.test(path))
    );
}

function isHostApi(specifier: string): boolean {
    return specifier === VSCODE_API || specifier.startsWith(INTELLIJ_PLATFORM_API);
}

function isCoreFile(path: string): boolean {
    return path.startsWith(CORE_DIR);
}

export function isHostFile({
    path,
    importedSpecifiers,
    implementedInterfaceFiles,
}: SourceDependencies): boolean {
    return (
        importedSpecifiers.some(isHostApi) ||
        (!isCoreFile(path) && implementedInterfaceFiles.some(isCoreFile))
    );
}

// A log line and an error's message are read by developers; the core does not word them.
function isUnreadArgument({ construct, callee = "", receiver = "", thrown }: CallSite): boolean {
    if (thrown === true) {
        return true;
    }
    if (construct) {
        return callee === "Error";
    }
    return LOGGING_CALLEE.test(callee) || LOGGING_RECEIVERS.has(receiver);
}

function holdsTwoWords(part: string): boolean {
    return part.split(WHITESPACE).filter((token) => WORD.test(token)).length >= 2;
}

// Each stretch on its own: a placeholder is no word, so a format such as `${a}: ${b}` holds no text.
function isShownText({ parts, argumentOf }: WrittenText): boolean {
    return parts.some(holdsTwoWords) && !argumentOf.some(isUnreadArgument);
}

function shownText(parts: readonly string[]): string {
    return parts.join(PLACEHOLDER).replace(/\s+/g, " ").trim();
}

function excerpt(text: string): string {
    return text.length <= MESSAGE_LENGTH ? text : `${text.slice(0, MESSAGE_LENGTH - 1)}…`;
}

// A fence one backtick longer than any run inside, so a Markdown text renders as written.
function codeSpan(text: string): string {
    const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(longestRun + 1);
    return longestRun === 0 ? `${fence}${text}${fence}` : `${fence} ${text} ${fence}`;
}

// Keyed without the line: moved code stays existing, and the same text twice in a file counts twice.
export function hostTextFindings(files: readonly HostFileTexts[]): Finding[] {
    return sortFindings(
        files.flatMap(({ path, texts }) =>
            texts.filter(isShownText).map(({ line, parts }): Finding => {
                const text = shownText(parts);
                return {
                    key: `${path} — ${text}`,
                    path,
                    paths: [path],
                    line,
                    message: codeSpan(excerpt(text)),
                };
            }),
        ),
    );
}
