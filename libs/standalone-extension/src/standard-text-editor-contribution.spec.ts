import { describe, expect, it, vi } from "vitest";

vi.mock("@theia/editor/lib/browser", () => ({
    EditorManager: Symbol("EditorManager"),
}));

import { URI } from "@theia/core/shared/vscode-uri";

import { StandardTextEditorContribution } from "./standard-text-editor-contribution";

const VIEW_COLUMN_BESIDE = -2;

interface OpenWithHandler {
    execute(resource: URI, viewType: string, columnOrOptions?: number): Promise<void>;
    isEnabled(resource: URI, viewType: string, columnOrOptions?: number): boolean;
}

function createHarness() {
    let handler: OpenWithHandler | undefined;
    const registerHandler = vi.fn((commandId: string, candidate: OpenWithHandler) => {
        handler = candidate;
        return { dispose: vi.fn() };
    });
    const openToSide = vi.fn().mockResolvedValue(undefined);
    const contribution = new StandardTextEditorContribution();

    Object.assign(contribution, {
        commands: { registerHandler },
        editorManager: { openToSide },
    });
    contribution.onStart();

    return {
        handler: handler!,
        openToSide,
        registerHandler,
    };
}

describe("StandardTextEditorContribution", () => {
    it("registers a compatibility handler for vscode.openWith", () => {
        const { registerHandler } = createHarness();

        expect(registerHandler).toHaveBeenCalledWith("vscode.openWith", expect.any(Object));
    });

    it.each(["bpmn", "dmn"])(
        "opens a .%s source file in Theia's text editor",
        async (extension) => {
            const { handler, openToSide } = createHarness();
            const resource = URI.file(`/workspace/process.${extension}`);

            expect(handler.isEnabled(resource, "default", VIEW_COLUMN_BESIDE)).toBe(true);
            await handler.execute(resource, "default", VIEW_COLUMN_BESIDE);

            expect(openToSide).toHaveBeenCalledOnce();
            expect(openToSide.mock.calls[0][0].toString()).toBe(resource.toString());
        },
    );

    it("leaves unrelated open-with requests to Theia's default handler", () => {
        const { handler } = createHarness();
        const bpmnResource = URI.file("/workspace/process.bpmn");

        expect(handler.isEnabled(URI.file("/workspace/readme.md"), "default", -2)).toBe(false);
        expect(handler.isEnabled(bpmnResource, "bpmn-modeler.bpmn", -2)).toBe(false);
        expect(handler.isEnabled(bpmnResource, "default", 1)).toBe(false);
    });
});
