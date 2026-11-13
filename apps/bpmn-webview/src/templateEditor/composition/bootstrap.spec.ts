import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TemplateBuilderState } from "@miragon/bpmn-modeler-element-template-builder";
import {
    type Command,
    DocumentFlushedCommand,
    ElementTemplateFileQuery,
    FlushDocumentQuery,
    GetElementTemplateFileCommand,
    LanguageQuery,
    LogErrorCommand,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";

const mocks = vi.hoisted(() => ({
    shown: [] as { template: Record<string, unknown>; engine: string }[],
    failure: undefined as Error | undefined,
    setTheme: vi.fn(),
    setLocale: vi.fn(),
    builderStates: [] as TemplateBuilderState[],
    translate: undefined as ((text: string) => string) | undefined,
}));

vi.mock("@miragon/bpmn-modeler", () => ({
    createTemplatePreview: vi.fn(async () => ({
        show: async (template: Record<string, unknown>, engine: string) => {
            if (mocks.failure) {
                throw mocks.failure;
            }
            mocks.shown.push({ template, engine });
            return { rendered: true, errors: [] };
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
        { translate }: { translate: (text: string) => string },
    ) => {
        mocks.translate = translate;
        return {
            show: (state: TemplateBuilderState) => mocks.builderStates.push(state),
            destroy: vi.fn(),
        };
    },
}));

vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({ extras: {} }));

import { i18n } from "@miragon/bpmn-modeler-i18n";

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

function receive(content: string, locale?: string, fileName?: string): void {
    window.dispatchEvent(
        new MessageEvent("message", {
            data: new ElementTemplateFileQuery(content, locale, ++revision, fileName),
        }),
    );
}

const query = (selector: string) => document.querySelector<HTMLElement>(selector);
const choice = () => query(".template-editor__choice") as HTMLSelectElement;
const chooser = () => query(".template-editor__chooser") as HTMLElement;
const lastBuilderState = () => mocks.builderStates[mocks.builderStates.length - 1];

beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = "";
    document.body.inert = false;
    document.body.innerHTML = '<div id="app"></div>';
    posted = [];
    revision = 0;
    mocks.shown = [];
    mocks.builderStates = [];
    mocks.failure = undefined;
    mocks.setTheme.mockClear();
    mocks.setLocale.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    dispose?.();
    dispose = undefined;
    i18n.setLanguage("en");
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
        expect(chooser().hidden).toBe(true);
    });

    it("starts a new template's name from its file name", async () => {
        await start();

        receive("", undefined, "send-invoice-mail.json");
        await vi.advanceTimersByTimeAsync(0);

        expect((query(".template-editor__wizard-name") as HTMLInputElement).value).toBe(
            "Send Invoice Mail",
        );
    });

    it("puts the preview to the right of the builder", async () => {
        await start();

        const columns = Array.from(query(".template-editor__body")!.children, (child) =>
            child.querySelector(".template-editor__builder") ? "builder" : child.id,
        );
        expect(columns).toEqual(["builder", "js-panel-resizer", "js-properties-panel"]);
    });

    it("hides and shows the preview from its divider", async () => {
        await start();
        const toggle = query(".panel-resizer-toggle")!;

        toggle.click();
        expect(query("#js-properties-panel")?.classList).toContain("collapsed");
        expect(toggle.getAttribute("aria-label")).toBe("Show preview");

        toggle.click();
        expect(query("#js-properties-panel")?.classList).not.toContain("collapsed");
        expect(toggle.getAttribute("aria-label")).toBe("Hide preview");
    });

    it("closes the preview when the editor turns narrow, and brings it back", async () => {
        vi.stubGlobal("innerWidth", 1000);
        await start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);
        const panel = query("#js-properties-panel")!;
        expect(panel.classList.contains("collapsed")).toBe(false);

        vi.stubGlobal("innerWidth", 500);
        window.dispatchEvent(new Event("resize"));
        expect(panel.classList.contains("collapsed")).toBe(true);

        vi.stubGlobal("innerWidth", 1000);
        window.dispatchEvent(new Event("resize"));
        expect(panel.classList.contains("collapsed")).toBe(false);
    });

    it("leaves a narrow editor to the builder until the preview is opened", async () => {
        vi.stubGlobal("innerWidth", 500);

        await start();

        expect(query("#js-properties-panel")?.classList).toContain("collapsed");
    });

    it("answers the host's save with the document it shows", async () => {
        await start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        window.dispatchEvent(
            new MessageEvent("message", { data: new FlushDocumentQuery(3, false) }),
        );
        await vi.advanceTimersByTimeAsync(0);

        expect(posted).toContainEqual(new DocumentFlushedCommand(3, undefined, "clean", 1));
    });

    it("locks the page for a destructive save until the host releases it", async () => {
        await start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        window.dispatchEvent(
            new MessageEvent("message", { data: new FlushDocumentQuery(3, true) }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(document.body.inert).toBe(true);

        window.dispatchEvent(
            new MessageEvent("message", { data: new ReleaseDocumentFlushQuery(3) }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(document.body.inert).toBe(false);
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

    it("relabels the page and the builder when the language changes", async () => {
        await start();
        receive(JSON.stringify([STATUS, MAIL]));
        await vi.advanceTimersByTimeAsync(0);
        const shown = mocks.builderStates.length;

        i18n.setLanguage("de");

        expect(choice().getAttribute("aria-label")).toBe("Vorlage");
        expect(mocks.builderStates.length).toBeGreaterThan(shown);
    });

    it("follows the host's dark theme", async () => {
        await start();
        expect(mocks.setTheme).toHaveBeenLastCalledWith("light");

        document.body.classList.add("vscode-dark");
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.setTheme).toHaveBeenLastCalledWith("dark");
    });

    it("hands every text it translates, the builder's too, to the page's recorder", async () => {
        const translated: string[] = [];
        dispose = await bootstrapTemplateEditor(
            { postMessage: (message) => posted.push(message) },
            { onTranslate: (text) => translated.push(text) },
        );

        receive("{");
        await vi.advanceTimersByTimeAsync(0);
        mocks.translate?.("Add Property");

        expect(translated).toEqual(
            expect.arrayContaining(["Preview", "The JSON is invalid: {message}", "Add Property"]),
        );
    });

    describe("as a preview only, for a host without the builder", () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="app" data-view="preview"></div>';
        });

        it("shows the preview of the file and no builder", async () => {
            await start();

            receive(JSON.stringify(STATUS));
            await vi.advanceTimersByTimeAsync(0);

            expect(query(".template-editor")?.classList).toContain("template-editor--preview-only");
            expect(query(".template-editor")?.classList).not.toContain(
                "template-editor--no-preview",
            );
            expect(mocks.shown).toEqual([{ template: STATUS, engine: "c8" }]);
            expect(mocks.builderStates).toEqual([]);
            expect(query(".panel-resizer-toggle")).toBeNull();
        });
    });

    it("needs the #app root", async () => {
        document.body.innerHTML = "";

        await expect(start()).rejects.toThrow("missing #app");
    });
});
