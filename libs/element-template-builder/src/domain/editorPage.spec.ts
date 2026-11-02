import { describe, expect, it } from "vitest";

import { ELEMENT_TEMPLATE_SCHEMA_URL } from "@miragon/bpmn-modeler-types";

import {
    builderStateOf,
    choicesOf,
    EMPTY_PAGE,
    engineOf,
    mainOf,
    messagesOf,
    pageForSelection,
    pageForText,
    pageWithDiagnostics,
    pageWithPreview,
    pageWithRefusal,
} from "./editorPage";

const C8 = {
    $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c8,
    id: "status",
    name: "Status",
    appliesTo: ["bpmn:ServiceTask"],
    properties: [],
};
const C7 = { $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c7, id: "mail", name: "Mail" };
const TEXT = JSON.stringify(C8);
const FILE = JSON.stringify([C8, C7]);

const pageOf = (text: string) => pageForText(EMPTY_PAGE, text, "host");

describe("the page for a file's text", () => {
    it.each([
        ["an empty file", "", "wizard"],
        ["no template", "[]", "placeholder"],
        ["broken JSON before any template", '{ "a": ', "placeholder"],
        ["no engine", '{"id":"plain"}', "engineChoice"],
        ["a template", TEXT, "builder"],
    ])("shows %s", (_, text, main) => {
        expect(mainOf(pageOf(text))).toBe(main);
    });

    it("stays on the last template, read-only, while the JSON is broken", () => {
        const broken = pageForText(pageOf(TEXT), '{ "a": ', "host");

        expect(mainOf(broken)).toBe("builder");
        expect(builderStateOf(broken)).toMatchObject({ template: C8, editable: false });
        expect(engineOf(broken)).toBeUndefined();
    });

    it("has nothing for the builder before the first template", () => {
        expect(builderStateOf(pageOf("[]"))).toBeUndefined();
    });

    it("names the engine and the template of the file", () => {
        const page = pageOf(TEXT);

        expect(engineOf(page)).toBe("c8");
        expect(builderStateOf(page)).toEqual({
            template: C8,
            engine: "c8",
            editable: true,
            diagnostics: [],
        });
    });

    it("offers the file's templates, also while the engine is unknown", () => {
        expect(choicesOf(pageOf(FILE)).choices.map(({ label }) => label)).toEqual([
            "Status",
            "Mail",
        ]);
        expect(choicesOf(pageOf('{"id":"plain"}')).selected?.key).toBe("plain@");
        expect(choicesOf(pageOf("[]"))).toEqual({ choices: [], selected: undefined });
    });
});

describe("staying on a template", () => {
    it("follows a picked template", () => {
        const page = pageForSelection(pageOf(FILE), FILE, 1);

        expect(builderStateOf(page)?.template).toEqual(C7);
    });

    it("stays on it when an edit here changes its id", () => {
        const page = pageForSelection(pageOf(FILE), FILE, 1);

        const edited = pageForText(page, JSON.stringify([C8, { ...C7, id: "m" }]), "edit");

        expect(builderStateOf(edited)?.template).toEqual({ ...C7, id: "m" });
    });

    it("does not mistake a neighbour for it when an edit here changes its id", () => {
        const twins = JSON.stringify([C7, { ...C7, name: "Second" }]);
        const page = pageForSelection(pageOf(twins), twins, 0);

        const edited = pageForText(
            page,
            JSON.stringify([
                { ...C7, id: "m" },
                { ...C7, name: "Second" },
            ]),
            "edit",
        );

        expect(builderStateOf(edited)?.template).toEqual({ ...C7, id: "m" });
    });

    it("follows it when the host's text moves it", () => {
        const page = pageForSelection(pageOf(FILE), FILE, 1);

        const moved = pageForText(page, JSON.stringify([C7, C8]), "host");

        expect(builderStateOf(moved)?.template).toEqual(C7);
    });

    it("remembers it across broken JSON", () => {
        const page = pageForSelection(pageOf(FILE), FILE, 1);

        const back = pageForText(pageForText(page, "{", "host"), FILE, "host");

        expect(builderStateOf(back)?.template).toEqual(C7);
    });
});

describe("what the page checks", () => {
    it("hands the findings to the builder and keeps them while the next text is checked", () => {
        const text = JSON.stringify({ ...C8, properties: [{ type: "Bogus" }] });

        const checked = pageWithDiagnostics(pageOf(text));
        expect(builderStateOf(checked)?.diagnostics.length).toBeGreaterThan(0);

        const next = pageForText(checked, TEXT, "edit");
        expect(builderStateOf(next)?.diagnostics).toEqual(builderStateOf(checked)?.diagnostics);
    });

    it("has nothing to check without a template", () => {
        const page = pageOf("[]");

        expect(pageWithDiagnostics(page)).toBe(page);
    });
});

describe("what the page says", () => {
    const say = (page: typeof EMPTY_PAGE, previewOnly = false) =>
        messagesOf(page, { previewOnly }).map(({ text }) => text);

    it("says nothing on a good template or the start form", () => {
        expect(say(pageOf(TEXT))).toEqual([]);
        expect(say(pageOf(""))).toEqual([]);
    });

    it("explains a file without a template, and one without an engine", () => {
        expect(say(pageOf("[]"))).toEqual(["This file does not contain an element template."]);
        expect(say(pageOf('{"id":"plain"}'))).toEqual([
            'The template has no "$schema" that names its engine.',
        ]);
    });

    it("explains broken JSON, with the parser's message", () => {
        expect(messagesOf(pageOf("{"), { previewOnly: false })).toEqual([
            {
                text: "The JSON is invalid: {message}",
                replacements: { message: expect.any(String) },
            },
            { text: "Fix it in the JSON editor; until then the builder is read-only." },
        ]);
    });

    describe("as a preview alone", () => {
        it("calls an empty file no template, as it has no start form", () => {
            expect(say(pageOf(""), true)).toEqual([
                "This file does not contain an element template.",
            ]);
        });

        it("does not ask to fix broken JSON in an editor it does not know", () => {
            expect(say(pageOf("{"), true)).toEqual(["The JSON is invalid: {message}"]);
        });

        it("says it still shows the last template", () => {
            expect(say(pageForText(pageOf(TEXT), "{", "host"), true)).toEqual([
                "The JSON is invalid: {message}",
                "The preview shows the last template without errors.",
            ]);
        });
    });

    describe("about an edit the JSON could not take", () => {
        const refused = pageWithRefusal(pageOf(TEXT), ["elementType", "value"]);

        it("names where", () => {
            expect(messagesOf(refused, { previewOnly: false })).toEqual([
                expect.objectContaining({ replacements: { path: "elementType.value" } }),
            ]);
        });

        it("keeps saying it over a preview run and a host's text", () => {
            const later = pageForText(
                pageWithPreview(refused, { rendered: true, errors: [] }),
                TEXT,
                "host",
            );

            expect(say(later)).toEqual(say(refused));
        });

        it("stops once an edit goes through", () => {
            expect(say(pageForText(refused, TEXT, "edit"))).toEqual([]);
        });
    });

    describe("about the preview", () => {
        const after = (outcome: Parameters<typeof pageWithPreview>[1], text = TEXT) =>
            say(pageWithPreview(pageWithDiagnostics(pageOf(text)), outcome));

        it("says nothing once it rendered", () => {
            expect(after({ rendered: true, errors: ["ignored"] })).toEqual([]);
        });

        it("names a type it cannot show yet", () => {
            expect(after({ rendered: false, errors: [], unsupportedType: "bpmn:Process" })).toEqual(
                ["Templates for {type} cannot be previewed yet."],
            );
        });

        it("says it keeps the last template when the problems list explains why", () => {
            const invalid = JSON.stringify({ ...C8, properties: [{ type: "Bogus" }] });

            expect(after({ rendered: false, errors: ["raw"] }, invalid)).toEqual([
                "The preview shows the last template without errors.",
            ]);
        });

        it("passes on its own errors when nothing else explains them, untranslated", () => {
            const page = pageWithPreview(pageOf(TEXT), { rendered: false, errors: ["raw"] });

            expect(messagesOf(page, { previewOnly: false })).toEqual([
                { text: "raw", verbatim: true },
            ]);
        });
    });
});
