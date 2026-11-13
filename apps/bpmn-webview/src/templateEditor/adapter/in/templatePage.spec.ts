import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TemplatePreviewOutcome } from "@miragon/bpmn-modeler";
import type { TemplateBuilderState } from "@miragon/bpmn-modeler-element-template-builder";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    createInertLock,
    ElementTemplateFileQuery,
    SyncDocumentCommand,
    type TemplateEditorCommand,
} from "@miragon/bpmn-modeler-shared";

import { TemplateDocumentSession } from "../../service/documentSession";
import { mountEditorView } from "./editorView";
import { createTemplatePage, type TemplatePage } from "./templatePage";

const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";
const C7_SCHEMA = "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";

const STATUS = {
    $schema: C8_SCHEMA,
    id: "status",
    name: "Status",
    appliesTo: ["bpmn:ServiceTask"],
    properties: [],
};
const MAIL = {
    $schema: C7_SCHEMA,
    id: "mail",
    name: "Mail",
    appliesTo: ["bpmn:ServiceTask"],
    properties: [],
};

let posted: TemplateEditorCommand[];
let logged: string[];
let shown: { template: object; engine: string }[];
let outcome: TemplatePreviewOutcome;
let failure: Error | undefined;
let builderStates: TemplateBuilderState[];
let revision: number;
let session: TemplateDocumentSession;
let page: TemplatePage;

function start({ previewOnly = false } = {}): void {
    const view = mountEditorView(
        document.getElementById("app")!,
        (template, replacements) => i18n.translate(template, replacements),
        { previewOnly },
    );
    session = new TemplateDocumentSession(
        { postMessage: (message) => posted.push(message) },
        (_text, origin) => page.showText(origin),
        createInertLock(document.body),
    );
    page = createTemplatePage({
        view,
        session,
        builder: { show: (state) => builderStates.push(state) },
        preview: {
            show: async (template, engine) => {
                if (failure) {
                    throw failure;
                }
                shown.push({ template, engine });
                return outcome;
            },
        },
        translate: (template, replacements) => i18n.translate(template, replacements),
        previewOnly,
        logError: (message) => logged.push(message),
    });
}

function receive(content: string, fileName?: string): void {
    if (fileName) {
        page.useFileName(fileName);
    }
    void session.receive(new ElementTemplateFileQuery(content, undefined, ++revision, fileName));
}

const query = (selector: string) => document.querySelector<HTMLElement>(selector);
const messages = () =>
    Array.from(document.querySelectorAll(".template-editor__messages p"), (p) => p.textContent);
const choice = () => query(".template-editor__choice") as HTMLSelectElement;
const chooser = () => query(".template-editor__chooser") as HTMLElement;
const lastBuilderState = () => builderStates[builderStates.length - 1];
const syncs = () => posted.filter((message) => message instanceof SyncDocumentCommand);

beforeEach(() => {
    vi.useFakeTimers();
    document.body.inert = false;
    document.body.innerHTML = '<div id="app"></div>';
    posted = [];
    logged = [];
    revision = 0;
    shown = [];
    builderStates = [];
    outcome = { rendered: true, errors: [] };
    failure = undefined;
});

afterEach(() => {
    page.dispose();
    session.dispose();
    i18n.setLanguage("en");
    vi.useRealTimers();
});

describe("createTemplatePage", () => {
    it("shows the first file at once in the builder and the preview", async () => {
        start();

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(shown).toEqual([{ template: STATUS, engine: "c8" }]);
        expect(lastBuilderState()).toEqual({
            template: STATUS,
            engine: "c8",
            editable: true,
            diagnostics: [],
        });
        expect(query(".template-editor__engine")?.textContent).toBe("Camunda 8");
        expect(query(".template-editor__builder")?.hidden).toBe(false);
        expect(chooser().hidden).toBe(true);
    });

    it("shows the host's edits once they pause", async () => {
        start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        receive(JSON.stringify({ ...STATUS, name: "Sta" }));
        await vi.advanceTimersByTimeAsync(50);
        receive(JSON.stringify(MAIL));
        await vi.advanceTimersByTimeAsync(99);
        expect(shown).toHaveLength(1);

        // The render waits on a few async steps after the debounce fires.
        await vi.advanceTimersByTimeAsync(50);
        expect(shown).toEqual([
            { template: STATUS, engine: "c8" },
            { template: MAIL, engine: "c7" },
        ]);
    });

    it("writes a builder edit into the file and sends it once editing pauses", async () => {
        start();
        receive(JSON.stringify(STATUS, null, 2));
        await vi.advanceTimersByTimeAsync(0);

        page.applyBuilderEdits([{ kind: "set", path: ["name"], value: "Renamed" }]);

        expect(lastBuilderState().template).toMatchObject({ name: "Renamed" });
        expect(shown).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(300);
        expect(shown.at(-1)?.template).toMatchObject({ name: "Renamed" });
        expect(syncs()).toEqual([
            new SyncDocumentCommand(JSON.stringify({ ...STATUS, name: "Renamed" }, null, 2), 1),
        ]);
    });

    it("edits the selected template of an array file", async () => {
        start();
        receive(JSON.stringify([STATUS, MAIL]));
        await vi.advanceTimersByTimeAsync(0);
        choice().selectedIndex = 1;
        choice().dispatchEvent(new Event("change"));

        page.applyBuilderEdits([{ kind: "set", path: ["name"], value: "Post" }]);
        await vi.advanceTimersByTimeAsync(300);

        expect(JSON.parse(syncs()[0].content)).toEqual([STATUS, { ...MAIL, name: "Post" }]);
    });

    it("stays on the selected template while its id is edited", async () => {
        start();
        receive(JSON.stringify([STATUS, MAIL]));
        await vi.advanceTimersByTimeAsync(0);
        choice().selectedIndex = 1;
        choice().dispatchEvent(new Event("change"));

        page.applyBuilderEdits([{ kind: "set", path: ["id"], value: "m" }]);
        expect(lastBuilderState().template).toMatchObject({ id: "m", name: "Mail" });
        page.applyBuilderEdits([{ kind: "set", path: ["id"], value: "ma" }]);
        await vi.advanceTimersByTimeAsync(300);

        expect(JSON.parse(syncs()[0].content)).toEqual([STATUS, { ...MAIL, id: "ma" }]);
    });

    it("stays on the selected template of two with the same id and version", async () => {
        start();
        receive(JSON.stringify([MAIL, { ...MAIL, name: "Second" }, STATUS]));
        await vi.advanceTimersByTimeAsync(0);
        choice().selectedIndex = 1;
        choice().dispatchEvent(new Event("change"));

        expect(lastBuilderState().template).toMatchObject({ name: "Second" });
        page.applyBuilderEdits([{ kind: "set", path: ["id"], value: "m" }]);

        expect(lastBuilderState().template).toMatchObject({ id: "m", name: "Second" });
    });

    it("follows a template that moved in the file", async () => {
        start();
        receive(JSON.stringify([STATUS, MAIL]));
        await vi.advanceTimersByTimeAsync(0);
        choice().selectedIndex = 1;
        choice().dispatchEvent(new Event("change"));

        receive(JSON.stringify([MAIL, STATUS]));
        await vi.advanceTimersByTimeAsync(150);

        expect(lastBuilderState().template).toMatchObject({ id: "mail" });
        expect(choice().selectedIndex).toBe(0);
    });

    it("says so and writes nothing when the JSON cannot take an edit", async () => {
        start();
        receive(JSON.stringify({ ...STATUS, elementType: "bpmn:ServiceTask" }));
        await vi.advanceTimersByTimeAsync(0);

        page.applyBuilderEdits([
            { kind: "set", path: ["elementType", "value"], value: "bpmn:UserTask" },
        ]);
        await vi.advanceTimersByTimeAsync(300);

        expect(syncs()).toEqual([]);
        expect(messages()).toEqual([
            "This change was not written: the JSON around elementType.value is not what the builder expects. Fix it in the JSON editor.",
        ]);
        expect(lastBuilderState().editable).toBe(true);
    });

    it("drops that message once an edit goes through", async () => {
        start();
        receive(JSON.stringify({ ...STATUS, elementType: "bpmn:ServiceTask" }));
        await vi.advanceTimersByTimeAsync(0);
        page.applyBuilderEdits([
            { kind: "set", path: ["elementType", "value"], value: "bpmn:UserTask" },
        ]);

        page.applyBuilderEdits([{ kind: "set", path: ["name"], value: "Renamed" }]);
        await vi.advanceTimersByTimeAsync(300);

        expect(messages()).toEqual([]);
    });

    it("says which of a file's templates is open", async () => {
        start();
        receive(JSON.stringify([STATUS, MAIL]));
        await vi.advanceTimersByTimeAsync(0);
        expect(chooser().hidden).toBe(false);
        expect(query(".template-editor__choice-position")?.textContent).toBe("1 of 2");

        choice().selectedIndex = 1;
        choice().dispatchEvent(new Event("change"));

        expect(query(".template-editor__choice-position")?.textContent).toBe("2 of 2");
    });

    it("starts a new template's name from its file name", async () => {
        start();

        receive("", "send-invoice-mail.json");
        await vi.advanceTimersByTimeAsync(0);

        expect((query(".template-editor__wizard-name") as HTMLInputElement).value).toBe(
            "Send Invoice Mail",
        );
    });

    it("leaves a name the user typed alone when the file arrives again", async () => {
        start();
        receive("", "send-mail.json");
        await vi.advanceTimersByTimeAsync(0);
        const name = query(".template-editor__wizard-name") as HTMLInputElement;
        name.value = "Mine";
        name.dispatchEvent(new Event("input"));

        receive("", "send-mail.json");

        expect(name.value).toBe("Mine");
    });

    it("lists element types by name and says which ones have no preview", async () => {
        start();
        receive("");
        await vi.advanceTimersByTimeAsync(0);
        const labels = Array.from(
            (query(".template-editor__wizard-element-type") as HTMLSelectElement).options,
            (option) => option.textContent,
        );

        expect(labels).toContain("Service task (bpmn:ServiceTask)");
        expect(labels).toContain("Process (bpmn:Process): no preview yet");
    });

    it("keeps the chosen element type when another engine also has it", async () => {
        start();
        receive("");
        await vi.advanceTimersByTimeAsync(0);
        const engine = query(".template-editor__wizard-engine") as HTMLSelectElement;
        const elementType = query(".template-editor__wizard-element-type") as HTMLSelectElement;
        elementType.value = "bpmn:UserTask";

        engine.value = "c7";
        engine.dispatchEvent(new Event("change"));
        expect(elementType.value).toBe("bpmn:UserTask");

        engine.value = "c8";
        engine.dispatchEvent(new Event("change"));
        elementType.value = "bpmn:ReceiveTask";
        engine.value = "c7";
        engine.dispatchEvent(new Event("change"));
        expect(elementType.value).toBe("bpmn:ServiceTask");
    });

    it("says why a template that is fine cannot be previewed", async () => {
        start();
        outcome = { rendered: false, errors: [], unsupportedType: "bpmn:Process" };

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(messages()).toEqual(["Templates for bpmn:Process cannot be previewed yet."]);
    });

    it("checks the template and hands the findings to the builder", async () => {
        start();

        receive(
            JSON.stringify({
                ...STATUS,
                properties: [{ type: "Bogus", binding: { type: "zeebe:input", name: "a" } }],
            }),
        );
        await vi.advanceTimersByTimeAsync(0);

        expect(lastBuilderState().diagnostics).toContainEqual(
            expect.objectContaining({ path: ["properties", 0, "type"], severity: "error" }),
        );
    });

    it("keeps the builder read-only on the last template while the JSON is broken", async () => {
        start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        receive("{");
        await vi.advanceTimersByTimeAsync(200);

        expect(lastBuilderState()).toMatchObject({ template: STATUS, editable: false });
        expect(messages()[0]).toContain("The JSON is invalid");
        expect(query(".template-editor")?.classList).not.toContain("template-editor--no-preview");
        expect(query(".template-editor__engine")?.hidden).toBe(true);
        page.applyBuilderEdits([{ kind: "set", path: ["name"], value: "Ignored" }]);
        await vi.advanceTimersByTimeAsync(300);
        expect(syncs()).toEqual([]);
    });

    it("shows only the wizard in an empty file, ready for a name", async () => {
        start();

        receive("");
        await vi.advanceTimersByTimeAsync(0);

        expect(query(".template-editor__toolbar")?.hidden).toBe(true);
        expect(query(".template-editor")?.classList).toContain("template-editor--no-preview");
        expect(document.activeElement).toBe(query(".template-editor__wizard-name"));
    });

    it("explains a broken file before it ever showed a template", async () => {
        start();

        receive("{");
        await vi.advanceTimersByTimeAsync(0);

        expect(query(".template-editor__placeholder")?.hidden).toBe(false);
        expect(query(".template-editor__builder")?.hidden).toBe(true);
        expect(query(".template-editor")?.classList).toContain("template-editor--no-preview");
        expect(query(".template-editor__toolbar")?.hidden).toBe(true);
    });

    it("creates a template from the wizard in an empty file", async () => {
        start();
        receive("", "send-mail.json");
        await vi.advanceTimersByTimeAsync(0);
        expect(query(".template-editor__wizard")?.hidden).toBe(false);
        expect(query(".template-editor__builder")?.hidden).toBe(true);

        (query(".template-editor__wizard-name") as HTMLInputElement).value = "Send Mail";
        query(".template-editor__wizard")!.dispatchEvent(new Event("submit", { cancelable: true }));
        await vi.advanceTimersByTimeAsync(300);

        expect(JSON.parse(syncs()[0].content)).toMatchObject({
            $schema: C8_SCHEMA,
            name: "Send Mail",
            id: "send-mail",
            appliesTo: ["bpmn:ServiceTask"],
        });
    });

    it("lets the user name the engine of a template without $schema", async () => {
        start();
        receive(JSON.stringify({ id: "plain", name: "Plain" }));
        await vi.advanceTimersByTimeAsync(0);
        expect(query(".template-editor__engine-choice")?.hidden).toBe(false);

        query('.template-editor__engine-button[data-engine="c7"]')!.click();
        await vi.advanceTimersByTimeAsync(300);

        expect(JSON.parse(syncs()[0].content)).toEqual({
            $schema: C7_SCHEMA,
            id: "plain",
            name: "Plain",
        });
    });

    it.each([
        ["JSON that is not a template", "42", "This file does not contain an element template."],
        [
            "a template without engine",
            JSON.stringify({ id: "plain" }),
            'The template has no "$schema" that names its engine.',
        ],
    ])("explains %s", async (_, content, message) => {
        start();

        receive(content);
        await vi.advanceTimersByTimeAsync(0);

        expect(shown).toEqual([]);
        expect(messages()).toContain(message);
    });

    it("explains why the preview shows an older template", async () => {
        outcome = {
            rendered: false,
            errors: ["Templates for bpmn:Process cannot be previewed yet."],
        };
        start();

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(messages()).toEqual(["Templates for bpmn:Process cannot be previewed yet."]);
    });

    it("reports a failing preview", async () => {
        failure = new Error("canvas gone");
        start();

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(logged).toEqual(["Template preview failed: Error: canvas gone"]);
    });

    it("relabels the page and the builder when the language changes", async () => {
        start();
        receive(JSON.stringify([STATUS, MAIL]));
        await vi.advanceTimersByTimeAsync(0);
        const shown = builderStates.length;

        i18n.setLanguage("de");
        page.relabel();

        expect(choice().getAttribute("aria-label")).toBe("Vorlage");
        expect(builderStates.length).toBeGreaterThan(shown);
    });

    it("shows nothing before the first file, even when its language comes first", async () => {
        start();

        i18n.setLanguage("de");
        page.relabel();

        expect(query(".template-editor__wizard")?.hidden).toBe(true);
        expect(builderStates).toEqual([]);
    });

    describe("as a preview only, for a host without the builder", () => {
        it("shows the preview of the file", async () => {
            start({ previewOnly: true });

            receive(JSON.stringify(STATUS));
            await vi.advanceTimersByTimeAsync(0);

            expect(query(".template-editor")?.classList).toContain("template-editor--preview-only");
            expect(query(".template-editor")?.classList).not.toContain(
                "template-editor--no-preview",
            );
            expect(shown).toEqual([{ template: STATUS, engine: "c8" }]);
        });

        it("explains what it cannot show instead of offering to write the file", async () => {
            start({ previewOnly: true });

            receive("");
            await vi.advanceTimersByTimeAsync(0);
            expect(messages()).toEqual(["This file does not contain an element template."]);

            receive(JSON.stringify(STATUS));
            await vi.advanceTimersByTimeAsync(200);
            receive("{");
            await vi.advanceTimersByTimeAsync(200);
            expect(messages()).toEqual([
                expect.stringContaining("The JSON is invalid:"),
                "The preview shows the last template without errors.",
            ]);
            expect(query(".template-editor")?.classList).not.toContain(
                "template-editor--no-preview",
            );
            expect(syncs()).toEqual([]);
        });
    });
});
