import { describe, expect, it } from "vitest";

import { describeAddOnViewRevealContract } from "@miragon/bpmn-modeler-core/testing";

import { AddOnsViewFocus, VsCodeAddOnsViewReveal } from "./VsCodeAddOnsViewReveal";

const ROWS = ["plugin:/work/.camunda/plugins/resize-tasks"];

/** A view whose focus command fails, as in a Theia shell without it. */
const UNFOCUSABLE: AddOnsViewFocus = {
    focus: () => Promise.reject(new Error("command 'bpmn-modeler.addOnsView.focus' not found")),
};

function connectedReveal(view: AddOnsViewFocus = { focus: async () => undefined }) {
    const revealed: (readonly string[])[] = [];
    const reveal = new VsCodeAddOnsViewReveal();
    reveal.connect({ reveal: (addOnIds) => revealed.push(addOnIds) }, view);
    return { reveal, revealed };
}

describeAddOnViewRevealContract("VsCodeAddOnsViewReveal", async ({ showsView }) => {
    const { reveal, revealed } = connectedReveal(showsView ? undefined : UNFOCUSABLE);
    return { view: reveal, shownRows: () => revealed };
});

describe("VsCodeAddOnsViewReveal", () => {
    it("focuses the Add-ons view, then has the catalog show the rows", async () => {
        const order: string[] = [];
        const reveal = new VsCodeAddOnsViewReveal();
        reveal.connect(
            { reveal: () => order.push("reveal") },
            { focus: async () => void order.push("focus") },
        );

        await expect(reveal.reveal(ROWS)).resolves.toBe(true);

        expect(order).toEqual(["focus", "reveal"]);
    });

    it("answers false before the catalog connects", async () => {
        await expect(new VsCodeAddOnsViewReveal().reveal(ROWS)).resolves.toBe(false);
    });

    it("leaves the rows unrevealed when the view cannot be focused", async () => {
        const { reveal, revealed } = connectedReveal(UNFOCUSABLE);

        await expect(reveal.reveal(ROWS)).resolves.toBe(false);

        expect(revealed).toEqual([]);
    });
});
