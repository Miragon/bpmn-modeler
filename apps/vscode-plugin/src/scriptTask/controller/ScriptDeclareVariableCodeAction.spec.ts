import { beforeEach, describe, expect, it, vi } from "vitest";

// The provider touches the `vscode` value namespace (`CodeAction`,
// `CodeActionKind`, `commands`, `languages`, `window`, `Uri`), so the factory
// supplies runtime stand-ins; hoisted spies keep them assertable.
const registerCodeActionsProviderMock = vi.fn();
const registerCommandMock = vi.fn();
const showTextDocumentMock = vi.fn();

vi.mock("vscode", () => {
    class CodeAction {
        command?: unknown;
        constructor(
            readonly title: string,
            readonly kind: unknown,
        ) {}
    }
    const fileUri = (path: string) => ({
        scheme: "file",
        path,
        fsPath: path,
        toString: () => `file://${path}`,
    });
    return {
        CodeAction,
        CodeActionKind: { QuickFix: "quickfix" },
        commands: { registerCommand: (...args: unknown[]) => registerCommandMock(...args) },
        languages: {
            registerCodeActionsProvider: (...args: unknown[]) =>
                registerCodeActionsProviderMock(...args),
        },
        window: { showTextDocument: (...args: unknown[]) => showTextDocumentMock(...args) },
        Uri: {
            file: fileUri,
            parse: (value: string) =>
                value.startsWith("file://")
                    ? fileUri(value.replace(/^file:\/\//, ""))
                    : { scheme: value.split(":")[0], path: value, fsPath: value },
        },
    };
});

import { Uri } from "vscode";

import { ScriptUri, ScriptVariableStore } from "@miragon/bpmn-modeler-core";

import { ScriptDeclareVariableCodeAction } from "./ScriptDeclareVariableCodeAction";

const EDITOR_ID = "file:///ws/process.bpmn";
const HASH = ScriptUri.hashEditorId(EDITOR_ID);
const SCRIPT_PATH = `/ws/.camunda/tmp/scripting/${HASH}/Task_1/script-task/Task_1.groovy`;

function createAction(options?: { trackedEditor?: string | undefined; variables?: string[] }) {
    const scriptTaskSvc = {
        getEditorIdForScriptUri: vi.fn((path: string) =>
            path === SCRIPT_PATH ? (options?.trackedEditor ?? EDITOR_ID) : undefined,
        ),
    };
    const store = new ScriptVariableStore();
    store.setExtracted(
        EDITOR_ID,
        (options?.variables ?? []).map((name) => ({
            name,
            origin: "spec",
            confidence: "declared" as const,
        })),
    );
    const manifestSvc = { upsert: vi.fn().mockResolvedValue("/ws/.camunda/vars/m.vars.json") };
    const notifier = { notifyError: vi.fn() };
    const action = new ScriptDeclareVariableCodeAction(
        scriptTaskSvc as never,
        store,
        manifestSvc as never,
        notifier as never,
    );
    return { action, scriptTaskSvc, manifestSvc, notifier };
}

/** A document over one line whose word range spans the whole line. */
function makeDocument(word: string, path = SCRIPT_PATH) {
    return {
        uri: Uri.file(path),
        getWordRangeAtPosition: () => (word.length > 0 ? {} : undefined),
        getText: () => word,
    };
}

const RANGE = { start: {} } as never;

beforeEach(() => {
    vi.clearAllMocks();
    showTextDocumentMock.mockResolvedValue(undefined);
});

describe("ScriptDeclareVariableCodeAction.provideCodeActions", () => {
    it("offers the quick-fix for an unknown identifier in a tracked script", () => {
        const { action } = createAction();
        const actions = action.provideCodeActions(makeDocument("orderTotal") as never, RANGE);
        expect(actions).toHaveLength(1);
        expect(actions[0].title).toBe("Declare 'orderTotal' in variable manifest");
    });

    it("offers nothing for a document the service does not track", () => {
        const { action, scriptTaskSvc } = createAction();
        const actions = action.provideCodeActions(
            makeDocument(
                "orderTotal",
                "/somewhere/tmp/scripting/x/y/script-task/z.groovy",
            ) as never,
            RANGE,
        );
        expect(actions).toEqual([]);
        expect(scriptTaskSvc.getEditorIdForScriptUri).toHaveBeenCalled();
    });

    it("offers nothing for a known process variable", () => {
        const { action } = createAction({ variables: ["orderTotal"] });
        expect(action.provideCodeActions(makeDocument("orderTotal") as never, RANGE)).toEqual([]);
    });

    it("offers nothing for an in-scope Camunda bean", () => {
        const { action } = createAction();
        expect(action.provideCodeActions(makeDocument("execution") as never, RANGE)).toEqual([]);
    });

    it("offers nothing for a non-identifier word", () => {
        const { action } = createAction();
        expect(action.provideCodeActions(makeDocument("1toel") as never, RANGE)).toEqual([]);
    });
});

describe("ScriptDeclareVariableCodeAction declare command", () => {
    /** Captures the command callback the action registers. */
    function registeredDeclare(action: ScriptDeclareVariableCodeAction) {
        action.register({ subscriptions: [] } as never);
        return registerCommandMock.mock.calls[0][1] as (
            scriptUri: unknown,
            name: string,
        ) => Promise<void>;
    }

    it("upserts a name-only entry and reveals the manifest", async () => {
        const { action, manifestSvc } = createAction();
        const declare = registeredDeclare(action);

        await declare(Uri.file(SCRIPT_PATH), "orderTotal");

        expect(manifestSvc.upsert).toHaveBeenCalledWith("/ws/process.bpmn", {
            name: "orderTotal",
        });
        expect(showTextDocumentMock).toHaveBeenCalled();
    });

    it("silently skips scripts whose tracking is gone", async () => {
        const { action, manifestSvc } = createAction();
        const declare = registeredDeclare(action);

        await declare(Uri.file("/untracked/tmp/scripting/a/b/script-task/c.groovy"), "x");

        expect(manifestSvc.upsert).not.toHaveBeenCalled();
    });

    it("surfaces a manifest write failure via the notifier", async () => {
        const { action, manifestSvc, notifier } = createAction();
        manifestSvc.upsert.mockRejectedValue(new Error("disk full"));
        const declare = registeredDeclare(action);

        await declare(Uri.file(SCRIPT_PATH), "orderTotal");

        expect(notifier.notifyError).toHaveBeenCalled();
    });
});
