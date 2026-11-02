import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { LogErrorCommand } from "./messages";
import { ElementTemplateFileQuery, GetElementTemplateFileCommand, LanguageQuery } from "./modeler";

// Shared with the IntelliJ host, which answers the preview page without a bridge session.
const MESSAGES = JSON.parse(
    readFileSync(resolve(__dirname, "elementTemplatePreviewMessages.cases.json"), "utf8"),
) as {
    fileQuery: { content: string; locale: string };
    languageQuery: { locale: string };
    getFile: object;
    logError: { message: string };
};

const onTheWire = (message: object): unknown => JSON.parse(JSON.stringify(message));

describe("the template preview page's messages", () => {
    it("delivers a file with the locale to render it in", () => {
        const { content, locale } = MESSAGES.fileQuery;

        expect(onTheWire(new ElementTemplateFileQuery(content, locale))).toEqual(
            MESSAGES.fileQuery,
        );
    });

    it("delivers a new language", () => {
        expect(onTheWire(new LanguageQuery(MESSAGES.languageQuery.locale))).toEqual(
            MESSAGES.languageQuery,
        );
    });

    it("asks for the file", () => {
        expect(onTheWire(new GetElementTemplateFileCommand())).toEqual(MESSAGES.getFile);
    });

    it("reports an error", () => {
        expect(onTheWire(new LogErrorCommand(MESSAGES.logError.message))).toEqual(
            MESSAGES.logError,
        );
    });
});
