import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// The prompt only touches `window.showInputBox`; a minimal mock is enough.
vi.mock("vscode", () => ({ window: { showInputBox: vi.fn() } }));

import { describeTokenPromptContract } from "@miragon/bpmn-modeler-core/testing";
import { window } from "vscode";

import { VsCodeTokenPrompt } from "./VsCodeTokenPrompt";

const PROMPT = {
    host: "github.com",
    title: "Personal Access Token for github.com",
    prompt: "why",
    password: true,
} as const;

beforeEach(() => {
    vi.resetAllMocks();
});

describeTokenPromptContract("VsCodeTokenPrompt", async () => ({
    tokenPrompt: new VsCodeTokenPrompt(),
    userTypes: (_prompt, text) => {
        (window.showInputBox as Mock).mockResolvedValueOnce(text);
    },
    userDismisses: () => {
        (window.showInputBox as Mock).mockResolvedValueOnce(undefined);
    },
}));

describe("VsCodeTokenPrompt", () => {
    it("shows the core's prompt in a masked, focus-persistent input box and returns what was typed", async () => {
        (window.showInputBox as Mock).mockResolvedValue("  tok  ");

        const result = await new VsCodeTokenPrompt().promptForToken(PROMPT);

        expect(result).toBe("  tok  ");
        expect(window.showInputBox).toHaveBeenCalledWith({
            title: "Personal Access Token for github.com",
            prompt: "why",
            password: true,
            // Load-bearing: the user leaves the editor to mint the PAT.
            ignoreFocusOut: true,
        });
    });
});
