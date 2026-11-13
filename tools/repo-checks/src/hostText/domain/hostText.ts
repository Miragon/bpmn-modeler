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
    /** Kotlin: the call whose parentheses the nearest lambda around the text follows. */
    readonly trailingLambdaOf?: CallSite;
}

/** A Kotlin `val` or `var`, a constructor property's default included, whose value is a call: `log` from `Logger.getInstance`. */
export interface InitializedValue {
    readonly name: string;
    /** The called name with its qualifiers. */
    readonly initializer: string;
}

export interface HostFileTexts {
    readonly path: string;
    readonly texts: readonly WrittenText[];
    readonly importedSpecifiers: readonly string[];
    readonly initializedValues: readonly InitializedValue[];
}

/** What a host file holds beyond its imports. */
export type HostFileSource = Pick<HostFileTexts, "texts" | "initializedValues">;

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
// The members of the core's LoggerPort: logInfo, logWarning, logError, logDebug.
const TYPESCRIPT_LOGGING_CALLEE = /^log(?![a-z])/;
const TYPESCRIPT_CONSOLE = "console";
const INTELLIJ_DIAGNOSTIC_PACKAGE = "com.intellij.openapi.diagnostic";
const INTELLIJ_LOGGER = "Logger";
const INTELLIJ_LOGGER_FACTORY = `${INTELLIJ_LOGGER}.getInstance`;
const INTELLIJ_THIS_LOGGER = "thisLogger";
// Kotlin's preconditions throw what their lambda returns, a message for developers.
const KOTLIN_PRECONDITIONS: ReadonlySet<string> = new Set([
    "require",
    "check",
    "requireNotNull",
    "checkNotNull",
]);
// A character no source text holds, so the stretches split again where they were joined.
const STRETCH_SEPARATOR = "\u0000";
// A tag spans the placeholders inside it; one the literal leaves open runs to its end.
const TAG = /<[!/]?[A-Za-z][^<>]*(>|$)/g;
// A page shows none of these elements' content as text.
const UNSHOWN_ELEMENT = /<(title|style|script)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi;
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

export function isTypeScriptLogCall({ construct, callee = "" }: CallSite): boolean {
    return !construct && TYPESCRIPT_LOGGING_CALLEE.test(callee);
}

function importsFromDiagnostics(importedSpecifiers: readonly string[], name: string): boolean {
    return importedSpecifiers.some(
        (specifier) =>
            specifier === `${INTELLIJ_DIAGNOSTIC_PACKAGE}.${name}` ||
            specifier === `${INTELLIJ_DIAGNOSTIC_PACKAGE}.*`,
    );
}

/** IntelliJ's loggers in a Kotlin file: values it declares from `Logger.getInstance(…)`, and `thisLogger()`. */
export function kotlinLoggers({
    importedSpecifiers,
    initializedValues,
}: Pick<HostFileTexts, "importedSpecifiers" | "initializedValues">): Set<string> {
    const factoryImported = importsFromDiagnostics(importedSpecifiers, INTELLIJ_LOGGER);
    const loggers = initializedValues
        .filter(
            ({ initializer }) =>
                initializer === `${INTELLIJ_DIAGNOSTIC_PACKAGE}.${INTELLIJ_LOGGER_FACTORY}` ||
                (factoryImported && initializer === INTELLIJ_LOGGER_FACTORY),
        )
        .map(({ name }) => name);
    if (importsFromDiagnostics(importedSpecifiers, INTELLIJ_THIS_LOGGER)) {
        loggers.push(INTELLIJ_THIS_LOGGER);
    }
    return new Set(loggers);
}

// A log line and an error's message are read by developers; the core does not word them.
function unreadArgumentRule(file: HostFileTexts): (site: CallSite) => boolean {
    const kotlin = isKotlinSource(file.path);
    const loggers = kotlin ? kotlinLoggers(file) : new Set([TYPESCRIPT_CONSOLE]);
    return (site) => {
        if (site.thrown === true) {
            return true;
        }
        if (site.construct) {
            return site.callee === "Error";
        }
        return loggers.has(site.receiver ?? "") || (!kotlin && isTypeScriptLogCall(site));
    };
}

function isPreconditionMessage(lambdaOf: CallSite | undefined): boolean {
    return lambdaOf?.receiver === undefined && KOTLIN_PRECONDITIONS.has(lambdaOf?.callee ?? "");
}

function holdsTwoWords(part: string): boolean {
    return part.split(WHITESPACE).filter((token) => WORD.test(token)).length >= 2;
}

function withoutMarkup(parts: readonly string[]): string[] {
    return parts
        .join(STRETCH_SEPARATOR)
        .replace(UNSHOWN_ELEMENT, " ")
        .replace(TAG, " ")
        .split(STRETCH_SEPARATOR);
}

// Each stretch on its own: a placeholder is no word, so a format such as `${a}: ${b}` holds no text.
function isShownText(
    { parts, argumentOf, trailingLambdaOf }: WrittenText,
    isUnreadArgument: (site: CallSite) => boolean,
): boolean {
    return (
        withoutMarkup(parts).some(holdsTwoWords) &&
        !argumentOf.some(isUnreadArgument) &&
        !isPreconditionMessage(trailingLambdaOf)
    );
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
        files.flatMap((file) => {
            const { path, texts } = file;
            const isUnreadArgument = unreadArgumentRule(file);
            return texts
                .filter((text) => isShownText(text, isUnreadArgument))
                .map(({ line, parts }): Finding => {
                    const text = shownText(parts);
                    return {
                        key: `${path} — ${text}`,
                        path,
                        paths: [path],
                        line,
                        message: codeSpan(excerpt(text)),
                    };
                });
        }),
    );
}
