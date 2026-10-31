import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    type Command,
    ElementTemplateFileQuery,
    GetElementTemplateFileCommand,
    LanguageQuery,
    LogErrorCommand,
} from "@miragon/bpmn-modeler-shared";

const mocks = vi.hoisted(() => ({
    shown: [] as { template: Record<string, unknown>; engine: string }[],
    outcome: { rendered: true, errors: [] as string[] } as { rendered: boolean; errors: string[] },
    failure: undefined as Error | undefined,
    setTheme: vi.fn(),
    setLocale: vi.fn(),
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

vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({ extras: {} }));

import { bootstrapTemplateEditor } from "./bootstrap";

const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";
const C7_SCHEMA = "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";

const STATUS = { $schema: C8_SCHEMA, id: "status", name: "Status" };
const MAIL = { $schema: C7_SCHEMA, id: "mail", name: "Mail" };

let posted: Command[];
let dispose: (() => void) | undefined;

async function start(): Promise<void> {
    dispose = await bootstrapTemplateEditor({ postMessage: (message) => posted.push(message) });
}

function receive(content: string): void {
    window.dispatchEvent(
        new MessageEvent("message", { data: new ElementTemplateFileQuery(content, 1) }),
    );
}

const text = (selector: string) => document.querySelector(selector)?.textContent;
const messages = () =>
    Array.from(document.querySelectorAll(".template-editor__messages p"), (p) => p.textContent);
const choice = () => document.querySelector<HTMLSelectElement>(".template-editor__choice")!;

beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = "";
    document.body.innerHTML = '<div id="app"></div>';
    posted = [];
    mocks.shown = [];
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

    it("shows the first content at once with its engine", async () => {
        await start();

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.shown).toEqual([{ template: STATUS, engine: "c8" }]);
        expect(text(".template-editor__engine")).toBe("Camunda 8");
        expect(choice().hidden).toBe(true);
        expect(messages()).toEqual([]);
    });

    it("waits for typing to pause before showing an edit", async () => {
        await start();
        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        receive(JSON.stringify({ ...STATUS, name: "Sta" }));
        await vi.advanceTimersByTimeAsync(200);
        receive(JSON.stringify(MAIL));
        await vi.advanceTimersByTimeAsync(299);
        expect(mocks.shown).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(mocks.shown).toEqual([
            { template: STATUS, engine: "c8" },
            { template: MAIL, engine: "c7" },
        ]);
        expect(text(".template-editor__engine")).toBe("Camunda 7");
    });

    it("keeps the chosen template of an array file across edits", async () => {
        await start();
        receive(JSON.stringify([STATUS, MAIL]));
        await vi.advanceTimersByTimeAsync(0);
        expect(choice().hidden).toBe(false);

        choice().value = "mail@";
        choice().dispatchEvent(new Event("change"));
        await vi.advanceTimersByTimeAsync(0);
        receive(JSON.stringify([STATUS, { ...MAIL, name: "Mail v2" }]));
        await vi.advanceTimersByTimeAsync(300);

        expect(mocks.shown.map(({ template }) => template.name)).toEqual([
            "Status",
            "Mail",
            "Mail v2",
        ]);
        expect(choice().value).toBe("mail@");
    });

    it.each([
        ["an empty file", "", "Add an element template to this file to preview it."],
        ["broken JSON", "{", "The preview shows the last valid template."],
        ["JSON that is not a template", "42", "This file does not contain an element template."],
        [
            "a template without engine",
            JSON.stringify({ id: "plain" }),
            'Add a "$schema" to choose between Camunda 7 and Camunda 8.',
        ],
    ])("explains %s and keeps the last preview", async (_, content, message) => {
        await start();

        receive(content);
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.shown).toEqual([]);
        expect(messages()).toContain(message);
    });

    it("lists the errors of a template the preview rejects", async () => {
        mocks.outcome = { rendered: false, errors: ["invalid property type"] };
        await start();

        receive(JSON.stringify(STATUS));
        await vi.advanceTimersByTimeAsync(0);

        expect(messages()).toEqual(["The template is invalid:", "invalid property type"]);
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

    it("applies the language the file arrives with before showing it", async () => {
        await start();

        window.dispatchEvent(
            new MessageEvent("message", {
                data: new ElementTemplateFileQuery(JSON.stringify(STATUS), 1, "de"),
            }),
        );
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.setLocale).toHaveBeenCalledWith("de");
        expect(mocks.shown).toHaveLength(1);
    });

    it("switches the preview's language", async () => {
        await start();

        window.dispatchEvent(new MessageEvent("message", { data: new LanguageQuery("de") }));
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.setLocale).toHaveBeenCalledWith("de");
    });

    it("follows the host's dark theme", async () => {
        await start();
        expect(mocks.setTheme).toHaveBeenLastCalledWith("light");

        document.body.classList.add("vscode-dark");
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.setTheme).toHaveBeenLastCalledWith("dark");
        expect(document.documentElement.getAttribute("data-bpmn-theme")).toBe("dark");
    });

    it("needs the #app root", async () => {
        document.body.innerHTML = "";

        await expect(start()).rejects.toThrow("missing #app");
    });
});
