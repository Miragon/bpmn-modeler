import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeWindowFake"));

import { MarketplaceAddPrompt } from "@miragon/bpmn-modeler-core";
import { describeMarketplacePromptContract } from "@miragon/bpmn-modeler-core/testing";

import { resetVscodeWindow, vscodeWindow } from "../../../__fixtures__/vscodeWindowFake";
import { VsCodeMarketplacePrompt } from "./VsCodeMarketplacePrompt";

const REFUSED = "Enter a repository URL.";

function addPrompt(): MarketplaceAddPrompt {
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
    };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Resolves with what `find` returns once VS Code has opened it. */
const opened = <T>(find: () => T | undefined): Promise<T> =>
    vi.waitFor(
        () => {
            const shown = find();
            if (shown === undefined) throw new Error("VS Code has not opened it yet");
            return shown;
        },
        { timeout: 1000, interval: 1 },
    );

beforeEach(() => {
    resetVscodeWindow();
});

describeMarketplacePromptContract("VsCodeMarketplacePrompt on the window fake", async () => {
    let asked = { box: 0, pick: 0 };
    return {
        prompt: new VsCodeMarketplacePrompt(),
        async replyToNext(question, reply) {
            asked = { box: vscodeWindow.inputBoxes.length, pick: vscodeWindow.quickPicks.length };
            const box = await opened(() => vscodeWindow.inputBoxes[asked.box]);
            if (!("enters" in reply)) {
                box.dismiss();
                return;
            }
            box.accept(reply.enters);
            if ("dismisses" in reply) {
                (await opened(() => vscodeWindow.quickPicks[asked.pick])).dismiss();
                return;
            }
            if (reply.picks === undefined) {
                await settle();
                if (vscodeWindow.quickPicks[asked.pick]) throw new Error("VS Code asked a scope");
                return;
            }
            const choice = question.scopes.find(({ scope }) => scope === reply.picks);
            if (!choice) throw new Error(`The question offers no "${reply.picks}" scope.`);
            (await opened(() => vscodeWindow.quickPicks[asked.pick])).pick(choice.label);
        },
        shown() {
            const box = vscodeWindow.inputBoxes[asked.box];
            const pick = vscodeWindow.quickPicks[asked.pick];
            return {
                title: box.options.title ?? "",
                prompt: box.options.prompt ?? "",
                placeholder: box.options.placeHolder ?? "",
                location: box.options.value ?? "",
                // The box shows the core's check on its entry; `invalidLocation` has no other place.
                refusal: box.message(),
                scopes: (pick?.items ?? []).map(({ label, description }) => ({
                    label,
                    description: description ?? "",
                })),
            };
        },
    };
});

describe("VsCodeMarketplacePrompt", () => {
    it("runs the core's check as the user types, so the box accepts only a location the core registers", async () => {
        const prompt = addPrompt();

        void new VsCodeMarketplacePrompt().promptForMarketplace(prompt);

        const [box] = vscodeWindow.inputBoxes;
        expect(box.options.validateInput).toBe(prompt.problemWith);
        expect(box.message("acme")).toBe(REFUSED);
        expect(() => box.accept("acme")).toThrow(REFUSED);
    });

    it("titles the scope pick with the core's title", async () => {
        void new VsCodeMarketplacePrompt().promptForMarketplace(addPrompt());
        vscodeWindow.inputBoxes[0].accept("https://github.com/acme/templates");
        await settle();

        expect(vscodeWindow.quickPicks[0].options).toEqual({ title: "Add Template Marketplace" });
    });
});
