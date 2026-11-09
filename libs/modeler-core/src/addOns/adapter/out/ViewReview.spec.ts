import { describe, expect, it, vi } from "vitest";

import { ChoicePrompt } from "../../../kernel/domain/prompts";
import { ApprovalReviewRequest } from "../../../kernel/port/approvalPorts";
import { ListReview } from "../../../kernel/adapter/out/ListReview";
import {
    describeApprovalReviewContract,
    RecordingAddOnViewReveal,
    ScriptedPicker,
} from "../../../testing";
import { ViewReview } from "./ViewReview";

const RESIZE = "/work/.camunda/plugins/resize-tasks";
const PALETTE = "/work/orders/.camunda/plugins/palette";
const LINKED = "/elsewhere/bpmnlint-plugin-linked";

const PROMPT: ChoicePrompt<string> = {
    id: "codeApproval",
    title: "Allow code from this workspace?",
    placeholder: "Check only the ones you trust.",
    items: [
        { label: "Resize Tasks", value: RESIZE },
        { label: "Palette", value: PALETTE },
    ],
};

function requestFor(
    artifactIds: readonly string[],
    workspaceFolders: readonly string[] = ["/work"],
): ApprovalReviewRequest {
    return { prompt: PROMPT, artifactIds, workspaceFolders };
}

function setUp(shows: boolean) {
    const picker = new ScriptedPicker({ [PROMPT.id]: [RESIZE] });
    const view = new RecordingAddOnViewReveal({ shows });
    return { picker, view, review: new ViewReview("plugin", view, new ListReview(picker)) };
}

describeApprovalReviewContract("ViewReview when the view cannot open", async () => {
    const answers: Record<string, unknown> = {};
    return {
        review: new ViewReview(
            "plugin",
            new RecordingAddOnViewReveal({ shows: false }),
            new ListReview(new ScriptedPicker(answers)),
        ),
        userChecks: (prompt, rows) => {
            answers[prompt.id] = rows.map((row) => prompt.items[row].value);
        },
        userDismisses: (prompt) => {
            delete answers[prompt.id];
        },
    };
});

describe("ViewReview", () => {
    it("leaves the pending code to the view, at the rows that list it", async () => {
        const { review, view, picker } = setUp(true);

        const answer = await review.review(requestFor([RESIZE, PALETTE]));

        expect(answer).toEqual({ kind: "leftForView" });
        expect(view.revealed).toEqual([[`plugin:${RESIZE}`, `plugin:${PALETTE}`]]);
        expect(picker.prompts).toEqual([]);
    });

    it("names rule packages as the catalog does", async () => {
        const view = new RecordingAddOnViewReveal();
        const acme = "/work/node_modules/bpmnlint-plugin-acme";

        await new ViewReview("rulePackage", view, new ListReview(new ScriptedPicker())).review(
            requestFor([acme]),
        );

        expect(view.revealed).toEqual([[`rulePackage:${acme}`]]);
    });

    it.each([
        { case: "one pending item lies outside every folder", ids: [RESIZE, LINKED], folders: ["/work"] },
        { case: "no folder is open", ids: [RESIZE], folders: [] },
    ])("shows the list, and not the view, when $case", async ({ ids, folders }) => {
        const { review, view } = setUp(true);

        const answer = await review.review(requestFor(ids, folders));

        expect(answer).toEqual({ kind: "checked", ids: [RESIZE] });
        expect(view.revealed).toEqual([]);
    });

    it("shows the list when the host cannot show its view", async () => {
        const { review, picker } = setUp(false);

        const answer = await review.review(requestFor([RESIZE]));

        expect(answer).toEqual({ kind: "checked", ids: [RESIZE] });
        expect(picker.prompts.map(({ method }) => method)).toEqual(["chooseMany"]);
    });

    it("shows the list when showing the view fails", async () => {
        const { review, view } = setUp(true);
        vi.spyOn(view, "reveal").mockRejectedValueOnce(new Error("no such command"));

        const answer = await review.review(requestFor([RESIZE]));

        expect(answer).toEqual({ kind: "checked", ids: [RESIZE] });
    });
});
