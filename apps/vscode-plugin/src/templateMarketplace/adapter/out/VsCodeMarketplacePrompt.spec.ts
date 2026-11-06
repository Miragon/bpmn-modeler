import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeWindowFake"));

import { MarketplaceAddPrompt } from "@miragon/bpmn-modeler-core";

import { resetVscodeWindow, vscodeWindow } from "../../../__fixtures__/vscodeWindowFake";
import { VsCodeMarketplacePrompt } from "./VsCodeMarketplacePrompt";

const REFUSED = "Enter a repository URL.";

function addPrompt(overrides: Partial<MarketplaceAddPrompt> = {}): MarketplaceAddPrompt {
    return {
        title: "Add Template Marketplace",
        prompt: "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
        placeholder: "https://github.com/owner/repo  or  ~/path/to/folder",
        location: "",
        scopes: [
            {
                scope: "project",
                label: "Register for this project",
                description: "Saved in .vscode/settings.json",
            },
            {
                scope: "allProjects",
                label: "Register for all my projects",
                description: "Saved in Settings ▸ User",
            },
        ],
        scope: "project",
        problemWith: (input) => (input.startsWith("https://") ? undefined : REFUSED),
        ...overrides,
    };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    resetVscodeWindow();
});

describe("VsCodeMarketplacePrompt", () => {
    it("asks for the location in an input box that checks as the user types, then for the scope in a quick pick", async () => {
        const prompt = addPrompt();

        const answer = new VsCodeMarketplacePrompt().promptForMarketplace(prompt);
        const [box] = vscodeWindow.inputBoxes;
        expect(box.options).toEqual({
            title: "Add Template Marketplace",
            prompt: "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
            placeHolder: "https://github.com/owner/repo  or  ~/path/to/folder",
            value: "",
            validateInput: prompt.problemWith,
        });
        expect(box.message("acme")).toBe(REFUSED);
        expect(() => box.accept("acme")).toThrow(REFUSED);
        box.accept("https://github.com/acme/templates");
        await settle();
        const [pick] = vscodeWindow.quickPicks;
        expect(pick.options).toEqual({ title: "Add Template Marketplace" });
        expect(pick.items).toEqual([
            {
                label: "Register for this project",
                description: "Saved in .vscode/settings.json",
                scope: "project",
            },
            {
                label: "Register for all my projects",
                description: "Saved in Settings ▸ User",
                scope: "allProjects",
            },
        ]);
        pick.pick("Register for all my projects");

        await expect(answer).resolves.toEqual({
            location: "https://github.com/acme/templates",
            scope: "allProjects",
        });
    });

    it("asks no scope when the core offers none, and answers with the core's scope", async () => {
        const answer = new VsCodeMarketplacePrompt().promptForMarketplace(
            addPrompt({ scopes: [], scope: "allProjects" }),
        );
        vscodeWindow.inputBoxes[0].accept("https://github.com/acme/templates");

        await expect(answer).resolves.toEqual({
            location: "https://github.com/acme/templates",
            scope: "allProjects",
        });
        expect(vscodeWindow.quickPicks).toEqual([]);
    });

    it("shows a refused entry again, and the core's check on it says why it was refused", async () => {
        void new VsCodeMarketplacePrompt().promptForMarketplace(
            addPrompt({ location: "acme", invalidLocation: REFUSED }),
        );

        const [box] = vscodeWindow.inputBoxes;
        expect(box.options.value).toBe("acme");
        expect(box.message()).toBe(REFUSED);
    });

    it("answers nothing and asks no scope when the input box is dismissed", async () => {
        const answer = new VsCodeMarketplacePrompt().promptForMarketplace(addPrompt());
        vscodeWindow.inputBoxes[0].dismiss();

        await expect(answer).resolves.toBeUndefined();
        expect(vscodeWindow.quickPicks).toEqual([]);
    });

    it("answers nothing when the scope pick is dismissed", async () => {
        const answer = new VsCodeMarketplacePrompt().promptForMarketplace(addPrompt());
        vscodeWindow.inputBoxes[0].accept("https://github.com/acme/templates");
        await settle();
        vscodeWindow.quickPicks[0].dismiss();

        await expect(answer).resolves.toBeUndefined();
    });
});
