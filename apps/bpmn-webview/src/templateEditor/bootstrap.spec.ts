import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    TemplateBuilderState,
    TemplateEdit,
} from "@miragon/bpmn-modeler-element-template-builder";
import {
    type Command,
    DocumentFlushedCommand,
    ElementTemplateFileQuery,
    FlushDocumentQuery,
    GetElementTemplateFileCommand,
    LanguageQuery,
    LogErrorCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";

const mocks = vi.hoisted(() => ({
    shown: [] as { template: Record<string, unknown>; engine: string }[],
    outcome: { rendered: true, errors: [] as string[] } as { rendered: boolean; errors: string[] },
    failure: undefined as Error | undefined,
    setTheme: vi.fn(),
    setLocale: vi.fn(),
    builderStates: [] as TemplateBuilderState[],
    onEdit: undefined as ((edits: TemplateEdit[]) => void) | undefined,
}));

vi.mock("@miragon/bpmn-modeler", () => ({
    createTemplatePreview: vi.fn(async () => ({
        show: async (template: Record<string, unknown>, engine: string) => {
            if (mocks.failure) {
                throw mocks.failure;
            }
            mocks.shown.push({ template, engine });
            return mocks.outcome;
        },
        setTheme: mocks.setTheme,
        setLocale: mocks.setLocale,
        destroy: vi.fn(),
    })),
}));

vi.mock("@miragon/bpmn-modeler-element-template-builder", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@miragon/bpmn-modeler-element-template-builder")>()),
    createTemplateBuilder: (
        _parent: HTMLElement,
        { onEdit }: { onEdit: (edits: TemplateEdit[]) => void },
    ) => {
        mocks.onEdit = onEdit;
        return {
            show: (state: TemplateBuilderState) => mocks.builderStates.push(state),
            destroy: vi.fn(),
        };
    },
}));

vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({ extras: {} }));

import { bootstrapTemplateEditor } from "./bootstrap";

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

let posted: Command[];
let dispose: (() => void) | undefined;
let revision: number;

async function start(): Promise<void> {
    dispose = await bootstrapTemplateEditor({ postMessage: (message) => posted.push(message) });
}

function receive(content: string, locale?: string): void {
    window.dispatchEvent(
        new MessageEvent("message", {
            data: new ElementTemplateFileQuery(content, ++revision, locale),
        }),
    );
}

const query = (selector: string) => document.querySelector<HTMLElement>(selector);
const messages = () =>
    Array.from(document.querySelectorAll(".template-editor__messages p"), (p) => p.textContent);
const choice = () => query(".template-editor__choice") as HTMLSelectElement;
const lastBuilderState = () => mocks.builderStates[mocks.builderStates.length - 1];
const syncs = () => posted.filter((message) => message instanceof SyncDocumentCommand);

beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = "";
    document.body.innerHTML = '<div id="app"></div>';
    posted = [];
    revision = 0;
    mocks.shown = [];
    mocks.builderStates = [];
    mocks.outcome = { rendered: true, errors: [] };
    mocks.failure = undefined;
    mocks.setTheme.mockClear();
    mocks.setLocale.mockClear();
});

afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.useRealTimers();
});

describe("bootstrapTemplateEditor", () => {
    it("asks the host for the template file once it listens", async () => {
        await start();

        expect(posted).toEqual([new GetElementTemplateFileCommand()]);
    });

    it("shows the first file at once in the builder and the preview", async () => {
        await start();

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.shown).toEqual([{ template: STATUS, engine: "c8" }]);
        expect(lastBuilderState()).toEqual({
            template: STATUS,
            engine: "c8",
            editable: true,
            diagnostics: [],
        });
        expect(query(".template-editor__engine")?.textContent).toBe("Camunda 8");
        expect(query(".template-editor__builder")?.hidden).toBe(false);
        expect(choice().hidden).toBe(true);
    });

    it("shows the host's edits once they pause", async () => {
        await start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        receive(JSON.stringify({ ...STATUS, name: "Sta" }));
        await vi.advanceTimersByTimeAsync(50);
        receive(JSON.stringify(MAIL));
        await vi.advanceTimersByTimeAsync(99);
        expect(mocks.shown).toHaveLength(1);

        // The render waits on a few async steps after the debounce fires.
        await vi.advanceTimersByTimeAsync(50);
        expect(mocks.shown).toEqual([
            { template: STATUS, engine: "c8" },
            { template: MAIL, engine: "c7" },
        ]);
    });

    it("writes a builder edit into the file and sends it once editing pauses", async () => {
        await start();
        receive(JSON.stringify(STATUS, null, 2));
        await vi.advanceTimersByTimeAsync(0);

        mocks.onEdit!([{ kind: "set", path: ["name"], value: "Renamed" }]);

        expect(lastBuilderState().template).toMatchObject({ name: "Renamed" });
        expect(mocks.shown).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(300);
        expect(mocks.shown.at(-1)?.template).toMatchObject({ name: "Renamed" });
        expect(syncs()).toEqual([
            new SyncDocumentCommand(JSON.stringify({ ...STATUS, name: "Renamed" }, null, 2), 1),
        ]);
    });

    it("edits the selected template of an array file", async () => {
        await start();
        receive(JSON.stringify([STATUS, MAIL]));
        await vi.advanceTimersByTimeAsync(0);
        choice().value = "mail@";
        choice().dispatchEvent(new Event("change"));

        mocks.onEdit!([{ kind: "set", path: ["name"], value: "Post" }]);
        await vi.advanceTimersByTimeAsync(300);

        expect(JSON.parse(syncs()[0].content)).toEqual([STATUS, { ...MAIL, name: "Post" }]);
    });

    it("checks the template and hands the findings to the builder", async () => {
        await start();

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
        await start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        receive("{");
        await vi.advanceTimersByTimeAsync(200);

        expect(lastBuilderState()).toMatchObject({ template: STATUS, editable: false });
        expect(messages()[0]).toContain("The JSON is invalid");
        expect(query(".template-editor")?.classList).not.toContain("template-editor--no-preview");
        expect(query(".template-editor__engine")?.hidden).toBe(true);
        mocks.onEdit!([{ kind: "set", path: ["name"], value: "Ignored" }]);
        await vi.advanceTimersByTimeAsync(300);
        expect(syncs()).toEqual([]);
    });

    it("shows only the wizard in an empty file, ready for a name", async () => {
        await start();

        receive("");
        await vi.advanceTimersByTimeAsync(0);

        expect(query(".template-editor__toolbar")?.hidden).toBe(true);
        expect(query(".template-editor")?.classList).toContain("template-editor--no-preview");
        expect(document.activeElement).toBe(query(".template-editor__wizard-name"));
    });

    it("explains a broken file before it ever showed a template", async () => {
        await start();

        receive("{");
        await vi.advanceTimersByTimeAsync(0);

        expect(query(".template-editor__placeholder")?.hidden).toBe(false);
        expect(query(".template-editor__builder")?.hidden).toBe(true);
        expect(query(".template-editor")?.classList).toContain("template-editor--no-preview");
        expect(query(".template-editor__toolbar")?.hidden).toBe(true);
    });

    it("creates a template from the wizard in an empty file", async () => {
        await start();
        receive("");
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
        await start();
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
        await start();

        receive(content);
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.shown).toEqual([]);
        expect(messages()).toContain(message);
    });

    it("explains why the preview shows an older template", async () => {
        mocks.outcome = {
            rendered: false,
            errors: ["Templates for bpmn:Process cannot be previewed yet."],
        };
        await start();

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(messages()).toEqual(["Templates for bpmn:Process cannot be previewed yet."]);
    });

    it("hides and shows the preview", async () => {
        await start();
        const toggle = query(".template-editor__preview-toggle")!;

        toggle.click();
        expect(query(".template-editor")?.classList).toContain("template-editor--preview-hidden");
        expect(toggle.getAttribute("aria-pressed")).toBe("false");

        toggle.click();
        expect(query(".template-editor")?.classList).not.toContain(
            "template-editor--preview-hidden",
        );
    });

    it("answers the host's save with the document it shows", async () => {
        await start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        window.dispatchEvent(
            new MessageEvent("message", { data: new FlushDocumentQuery(3, false) }),
        );
        await vi.advanceTimersByTimeAsync(0);

        expect(posted).toContainEqual(new DocumentFlushedCommand(3, undefined, "clean"));
    });

    it("reports a failing preview to the host log", async () => {
        mocks.failure = new Error("canvas gone");
        await start();

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(posted).toContainEqual(
            new LogErrorCommand("Template preview failed: Error: canvas gone"),
        );
    });

    it("applies the language the file arrives with and later changes", async () => {
        await start();

        receive(JSON.stringify(STATUS), "de");
        window.dispatchEvent(new MessageEvent("message", { data: new LanguageQuery("fr") }));
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.setLocale.mock.calls).toEqual([["de"], ["fr"]]);
    });

    it("follows the host's dark theme", async () => {
        await start();
        expect(mocks.setTheme).toHaveBeenLastCalledWith("light");

        document.body.classList.add("vscode-dark");
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.setTheme).toHaveBeenLastCalledWith("dark");
    });

    it("needs the #app root", async () => {
        document.body.innerHTML = "";

        await expect(start()).rejects.toThrow("missing #app");
    });
});
