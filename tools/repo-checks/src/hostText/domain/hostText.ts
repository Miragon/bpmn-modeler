import { isTypeScriptSource } from "@miragon/architecture-testing";

import { type Finding, sortFindings } from "../../fitness/domain/finding";
import {
    developerMessageRule,
    type EnclosingCalls,
    type LoggerDeclarations,
} from "./developerMessages";

/** What makes a file host code: the modules it imports and the files declaring the interfaces its classes implement. */
export interface SourceDependencies {
    readonly path: string;
    readonly importedSpecifiers: readonly string[];
    readonly implementedInterfaceFiles: readonly string[];
}

export interface WrittenText extends EnclosingCalls {
    readonly line: number;
    /** One for a plain literal; a template's literal stretches around its placeholders. */
    readonly parts: readonly string[];
}

export interface HostFileTexts extends LoggerDeclarations {
    readonly path: string;
    readonly texts: readonly WrittenText[];
}

/** What a host file holds beyond its imports. */
export type HostFileSource = Pick<HostFileTexts, "texts" | "initializedValues">;

// Gradle's main source set; its tests sit in src/test/kotlin.
const KOTLIN_SOURCE = /(^|\/)src\/main\/kotlin\/.+\.kt$/;
const VSCODE_API = "vscode";
const INTELLIJ_PLATFORM_API = "com.intellij.";
const CORE_DIR = "libs/modeler-core/";
// A word holds a letter or a digit, so punctuation around whitespace, such as `:root {` or `, '*');`, is none.
const WORD = /[\p{L}\p{N}]/u;
const WHITESPACE = /\s+/;
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

// Host text scans the whole tree, root files included, so a test folder counts anywhere in the repo path.
export function isScannedSource(path: string): boolean {
    return isKotlinSource(path) || isTypeScriptSource(path);
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
    text: WrittenText,
    isDeveloperMessage: (calls: EnclosingCalls) => boolean,
): boolean {
    return withoutMarkup(text.parts).some(holdsTwoWords) && !isDeveloperMessage(text);
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
            const isDeveloperMessage = developerMessageRule({
                ...file,
                kotlin: isKotlinSource(path),
            });
            return texts
                .filter((text) => isShownText(text, isDeveloperMessage))
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
