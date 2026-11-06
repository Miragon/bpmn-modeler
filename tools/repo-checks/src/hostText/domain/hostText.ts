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

const SCANNED_SOURCE = /\.([mc]?ts|tsx)$/;
// Specs and fixtures are inputs of tests, and a declaration file only types code; none of them is host code.
const UNSCANNED_SOURCE = /\.(spec|test)\.[^/]+$|(^|\/)__fixtures__\/|\.d\.[mc]?ts$/;
const HOST_API = "vscode";
const CORE_DIR = "libs/modeler-core/";
// Two words: whitespace between two non-space characters, so one word or padding around it is no text.
const WORDS = /\S\s+\S/;
const LOGGING_CALLEE = /^log(?![a-z])/;
const LOGGING_RECEIVERS: ReadonlySet<string> = new Set(["logger", "console"]);
const PLACEHOLDER = "${…}";
const MESSAGE_LENGTH = 100;

export function isScannedSource(path: string): boolean {
    return SCANNED_SOURCE.test(path) && !UNSCANNED_SOURCE.test(path);
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
        importedSpecifiers.includes(HOST_API) ||
        (!isCoreFile(path) && implementedInterfaceFiles.some(isCoreFile))
    );
}

// A log line and an error's message are read by developers; the core does not word them.
function isUnreadArgument({ construct, callee = "", receiver = "" }: CallSite): boolean {
    if (construct) {
        return callee === "Error";
    }
    return LOGGING_CALLEE.test(callee) || LOGGING_RECEIVERS.has(receiver);
}

// Each stretch on its own: a placeholder is no word, so a format such as `${a}: ${b}` holds no text.
function isShownText({ parts, argumentOf }: WrittenText): boolean {
    return parts.some((part) => WORDS.test(part)) && !argumentOf.some(isUnreadArgument);
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
                return { key: `${path} — ${text}`, path, line, message: codeSpan(excerpt(text)) };
            }),
        ),
    );
}
