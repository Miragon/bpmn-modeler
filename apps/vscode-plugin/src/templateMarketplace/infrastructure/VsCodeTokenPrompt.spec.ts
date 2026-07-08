import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// The prompt only touches `window.showInputBox`; a minimal mock is enough.
vi.mock("vscode", () => ({ window: { showInputBox: vi.fn() } }));

import { window } from "vscode";

import { VsCodeTokenPrompt } from "./VsCodeTokenPrompt";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("VsCodeTokenPrompt", () => {
    it("prompts with a masked, focus-persistent input box", async () => {
        (window.showInputBox as Mock).mockResolvedValue("tok");

        const result = await new VsCodeTokenPrompt().promptForToken("github.com", "why");

        expect(result).toBe("tok");
        expect(window.showInputBox).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Personal Access Token for github.com",
                prompt: "why",
                password: true,
                // Load-bearing: the user leaves the editor to mint the PAT.
                ignoreFocusOut: true,
            }),
        );
    });

    it("trims surrounding whitespace from the entered token", async () => {
        (window.showInputBox as Mock).mockResolvedValue("  tok  ");
        expect(await new VsCodeTokenPrompt().promptForToken("h", "r")).toBe("tok");
    });

    it("maps whitespace-only input to undefined so no empty token is stored", async () => {
        (window.showInputBox as Mock).mockResolvedValue("   ");
        expect(await new VsCodeTokenPrompt().promptForToken("h", "r")).toBeUndefined();
    });

    it("maps a cancelled box to undefined", async () => {
        (window.showInputBox as Mock).mockResolvedValue(undefined);
        expect(await new VsCodeTokenPrompt().promptForToken("h", "r")).toBeUndefined();
    });
});
