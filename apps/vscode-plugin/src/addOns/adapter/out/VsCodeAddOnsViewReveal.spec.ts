import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeWindowFake"));

import { commands } from "vscode";

import { describeAddOnViewRevealContract } from "@miragon/bpmn-modeler-core/testing";

import { resetVscodeWindow, vscodeWindow } from "../../../__fixtures__/vscodeWindowFake";
import { VsCodeAddOnsViewReveal } from "./VsCodeAddOnsViewReveal";

const ROWS = ["plugin:/work/.camunda/plugins/resize-tasks"];

/** A host without the view's focus command, as a Theia shell may be. */
function withoutFocusCommand(): void {
    vi.spyOn(commands, "executeCommand").mockRejectedValue(
        new Error("command 'bpmn-modeler.artifactsView.focus' not found"),
    );
}

function connectedReveal() {
    const revealed: (readonly string[])[] = [];
    const reveal = new VsCodeAddOnsViewReveal();
    reveal.connect({ reveal: (addOnIds) => revealed.push(addOnIds) });
    return { reveal, revealed };
}

afterEach(() => {
    vi.restoreAllMocks();
    resetVscodeWindow();
});

describeAddOnViewRevealContract("VsCodeAddOnsViewReveal", async ({ showsView }) => {
    if (!showsView) withoutFocusCommand();
    const { reveal, revealed } = connectedReveal();
    return { view: reveal, shownRows: () => revealed };
});

describe("VsCodeAddOnsViewReveal", () => {
    it("focuses the Artifacts view, then has the catalog show the rows", async () => {
        const order: string[] = [];
        vi.spyOn(commands, "executeCommand").mockImplementation(async (command: string) => {
            order.push(command);
            return undefined;
        });
        const reveal = new VsCodeAddOnsViewReveal();
        reveal.connect({ reveal: () => order.push("reveal") });

        await expect(reveal.reveal(ROWS)).resolves.toBe(true);

        expect(order).toEqual(["bpmn-modeler.artifactsView.focus", "reveal"]);
    });

    it("answers false and runs nothing before the catalog connects", async () => {
        const reveal = new VsCodeAddOnsViewReveal();

        await expect(reveal.reveal(ROWS)).resolves.toBe(false);

        expect(vscodeWindow.executedCommands).toEqual([]);
    });

    it("leaves the rows unrevealed when the view cannot be focused", async () => {
        withoutFocusCommand();
        const { reveal, revealed } = connectedReveal();

        await expect(reveal.reveal(ROWS)).resolves.toBe(false);

        expect(revealed).toEqual([]);
    });
});
