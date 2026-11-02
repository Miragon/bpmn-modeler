import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ElementTemplateFileQuery, LanguageQuery } from "./modeler";
import { TEMPLATE_EDITOR_COMMAND_TYPES } from "./templateEditorCommands";

// IntelliJ answers the template preview page itself, in Kotlin. Its tests run these rows, so a
// message changed here fails there instead of breaking the preview silently.
const CASES = JSON.parse(
    readFileSync(resolve(__dirname, "templateEditorMessages.cases.json"), "utf8"),
) as {
    fileQuery: { content: string; documentRevision: number; locale: string };
    languageQuery: { locale: string };
    commands: string[];
};

const wire = (message: object): unknown => JSON.parse(JSON.stringify(message));

describe("the template editor's messages", () => {
    it("sends a file the way the shared rows say", () => {
        const { content, documentRevision, locale } = CASES.fileQuery;

        expect(wire(new ElementTemplateFileQuery(content, documentRevision, locale))).toEqual(
            CASES.fileQuery,
        );
    });

    it("sends a language the way the shared rows say", () => {
        expect(wire(new LanguageQuery(CASES.languageQuery.locale))).toEqual(CASES.languageQuery);
    });

    it("lists every command the page may post", () => {
        expect(CASES.commands).toEqual([...TEMPLATE_EDITOR_COMMAND_TYPES]);
    });
});
