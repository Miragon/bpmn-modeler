import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    BpmnPluginsQuery,
    Command,
    ElementIdReviewCommand,
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    UpdateLintResultsCommand,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../../testing";
import { ElementIdsService } from "../../service/ElementIdsService";
import {
    answerWithoutPluginsHandler,
    elementIdReviewHandler,
    getBpmnlintConfigHandler,
    getBpmnModelerSettingHandler,
    getClipboardHandler,
    getElementTemplatesHandler,
    getPropertiesPanelStateHandler,
    getTextClipboardHandler,
    setClipboardHandler,
    setPropertiesPanelStateHandler,
    setTextClipboardHandler,
    updateLintResultsHandler,
} from "./bpmnMessageHandlers";

const EDITOR = "file:///work/diagram.bpmn";
const SWITCH_MODE = "Switch to Design or Implement mode to generate IDs from names.";
// Commands the read-style handlers ignore; a typed placeholder keeps signatures honest.
const ANY: Command = { type: "Ignored" } as Command;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("read-style handlers forward the editor id", () => {
    it("getElementTemplatesHandler → setElementTemplates", () => {
        const svc = { setElementTemplates: vi.fn() };
        getElementTemplatesHandler(svc as never)(ANY, EDITOR);
        expect(svc.setElementTemplates).toHaveBeenCalledWith(EDITOR);
    });

    it("getPropertiesPanelStateHandler → sendPropertiesPanelState", () => {
        const svc = { sendPropertiesPanelState: vi.fn() };
        getPropertiesPanelStateHandler(svc as never)(ANY, EDITOR);
        expect(svc.sendPropertiesPanelState).toHaveBeenCalledWith(EDITOR);
    });

    it("getClipboardHandler → readClipboard", () => {
        const svc = { readClipboard: vi.fn() };
        getClipboardHandler(svc as never)(ANY, EDITOR);
        expect(svc.readClipboard).toHaveBeenCalledWith(EDITOR);
    });

    it("getTextClipboardHandler → readTextClipboard", () => {
        const svc = { readTextClipboard: vi.fn() };
        getTextClipboardHandler(svc as never)(ANY, EDITOR);
        expect(svc.readTextClipboard).toHaveBeenCalledWith(EDITOR);
    });
});

describe("getBpmnModelerSettingHandler", () => {
    it("broadcasts both settings and language", () => {
        const broadcaster = { setSettings: vi.fn(), setLanguage: vi.fn() };

        getBpmnModelerSettingHandler(broadcaster as never)(ANY, EDITOR);

        expect(broadcaster.setSettings).toHaveBeenCalledWith(EDITOR);
        expect(broadcaster.setLanguage).toHaveBeenCalledWith(EDITOR);
    });
});

describe("set-style handlers forward the command payload", () => {
    it("setPropertiesPanelStateHandler → setPropertiesPanelVisibility(visible)", () => {
        const svc = { setPropertiesPanelVisibility: vi.fn() };
        setPropertiesPanelStateHandler(svc as never)(
            new SetPropertiesPanelStateCommand(true),
            EDITOR,
        );
        expect(svc.setPropertiesPanelVisibility).toHaveBeenCalledWith(true);
    });

    it("setClipboardHandler → writeClipboard(text)", () => {
        const svc = { writeClipboard: vi.fn() };
        setClipboardHandler(svc as never)(new SetClipboardCommand("payload"), EDITOR);
        expect(svc.writeClipboard).toHaveBeenCalledWith("payload");
    });

    it("setTextClipboardHandler → writeClipboard(text)", () => {
        const svc = { writeClipboard: vi.fn() };
        setTextClipboardHandler(svc as never)(new SetTextClipboardCommand("plain"), EDITOR);
        expect(svc.writeClipboard).toHaveBeenCalledWith("plain");
    });
});

describe("updateLintResultsHandler", () => {
    it("forwards the webview's in-page findings to applyWebviewLintResults", () => {
        const lintSvc = { applyWebviewLintResults: vi.fn() };
        const results = {
            "label-required": [{ id: "Task_1", message: "needs a label", category: "warn" }],
        };
        const unresolved = ["some-plugin/some-rule"];

        updateLintResultsHandler(lintSvc as never)(
            new UpdateLintResultsCommand(results, unresolved),
            EDITOR,
        );

        expect(lintSvc.applyWebviewLintResults).toHaveBeenCalledWith(
            EDITOR,
            results,
            unresolved,
            undefined,
        );
    });

    it("forwards the config token so the service can pair the run with its config version", () => {
        const lintSvc = { applyWebviewLintResults: vi.fn() };
        const results = {};

        updateLintResultsHandler(lintSvc as never)(
            new UpdateLintResultsCommand(results, [], "lint-cfg-7"),
            EDITOR,
        );

        expect(lintSvc.applyWebviewLintResults).toHaveBeenCalledWith(
            EDITOR,
            results,
            [],
            "lint-cfg-7",
        );
    });
});

describe("a rejecting service promise propagates through the handler", () => {
    // The router awaits each handler and the session lifecycle logs a rejection —
    // but only if the handler returns/awaits the service promise.
    const boom = new Error("service failed");

    it("getElementTemplatesHandler rejects when setElementTemplates rejects", async () => {
        const svc = { setElementTemplates: vi.fn().mockRejectedValue(boom) };
        await expect(getElementTemplatesHandler(svc as never)(ANY, EDITOR)).rejects.toThrow(boom);
    });

    it("getBpmnlintConfigHandler rejects when answering the lint config request rejects", async () => {
        const svc = { answerLintConfigRequest: vi.fn().mockRejectedValue(boom) };
        await expect(getBpmnlintConfigHandler(svc as never)(ANY, EDITOR)).rejects.toThrow(boom);
    });

    it("getBpmnModelerSettingHandler rejects when setSettings rejects, still setting language", async () => {
        const broadcaster = {
            setSettings: vi.fn().mockRejectedValue(boom),
            setLanguage: vi.fn(),
        };

        await expect(
            getBpmnModelerSettingHandler(broadcaster as never)(ANY, EDITOR),
        ).rejects.toThrow(boom);
        // Language is posted before settings is awaited, so it still fires.
        expect(broadcaster.setLanguage).toHaveBeenCalledWith(EDITOR);
    });
});

describe("answerWithoutPluginsHandler", () => {
    it("answers with no plugins at once", async () => {
        const host = createTestHost();
        const editor = host.openEditor("/work/diagram.bpmn");

        await answerWithoutPluginsHandler(host.store)(ANY, editor.id);

        expect(editor.postedOfType<BpmnPluginsQuery>("BpmnPluginsQuery")).toEqual([
            new BpmnPluginsQuery([]),
        ]);
    });

    it("leaves a hidden editor alone, which asks again once shown", async () => {
        const host = createTestHost();
        const editor = host.openEditor("/work/diagram.bpmn");
        editor.hidden = true;

        await expect(
            answerWithoutPluginsHandler(host.store)(ANY, editor.id),
        ).resolves.toBeUndefined();
        expect(editor.posted).toEqual([]);
    });
});

describe("elementIdReviewHandler", () => {
    it.each([
        { status: "unsupported" as const, infos: [SWITCH_MODE] },
        { status: "opened" as const, infos: [] },
    ])("reports a $status review to the user as the core words it", async ({ status, infos }) => {
        const host = createTestHost();
        const editor = host.openEditor("/work/diagram.bpmn");

        await elementIdReviewHandler(new ElementIdsService(host.store, host.notifier))(
            new ElementIdReviewCommand(status),
            editor.id,
        );

        expect(host.notifier.infos).toEqual(infos);
    });
});
