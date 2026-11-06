import { vi } from "vitest";

// The system clipboard every VS Code window and every other program share.
const systemClipboard = { text: "" };

vi.mock("vscode", () => ({
    env: {
        clipboard: {
            readText: async () => systemClipboard.text,
            writeText: async (text: string) => {
                systemClipboard.text = text;
            },
        },
    },
}));

import { describeClipboardContract } from "@miragon/bpmn-modeler-core/testing";

import { VsCodeClipboard } from "./VsCodeClipboard";

describeClipboardContract("VsCodeClipboard over a fake env.clipboard", async () => {
    systemClipboard.text = "";
    return {
        clipboard: new VsCodeClipboard(),
        copyElsewhere: async (text) => {
            systemClipboard.text = text;
        },
        pasteElsewhere: async () => systemClipboard.text,
    };
});
