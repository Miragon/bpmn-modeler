import { describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../testing";
import { ConflictMarkerParticipant } from "./ConflictMarkerParticipant";

const CONFLICTED = "<<<<<<< HEAD\n<current/>\n=======\n<incoming/>\n>>>>>>> feature\n";
const CLEAN = '<bpmn:definitions id="Definitions_1" />';

function createParticipant(noticeAnswers = {}) {
    const host = createTestHost({ noticeAnswers });
    const opened: string[] = [];
    const participant = new ConflictMarkerParticipant(host.documents, host.actionNotifier, {
        open: async (fileUri) => {
            opened.push(fileUri ?? "");
        },
    });
    return { host, participant, opened };
}

describe("ConflictMarkerParticipant", () => {
    it("offers the merge view once per editor, not on a re-display or a host update", async () => {
        const { host, participant } = createParticipant();
        const editor = await host.openSession("/repo/order.bpmn", [participant], {
            content: CONFLICTED,
        });

        editor.changeDocument(`${CONFLICTED}\n`);
        editor.changeDocument(CONFLICTED);

        expect(host.actionNotifier.notices.map((notice) => notice.message)).toStrictEqual([
            "order.bpmn holds Git conflict markers, so the modeler cannot show it. Resolve the conflict in the BPMN merge view.",
        ]);
    });

    it("offers again after the markers came back", async () => {
        const { host, participant } = createParticipant();
        const editor = await host.openSession("/repo/order.bpmn", [participant], {
            content: CONFLICTED,
        });

        editor.changeDocument(CLEAN);
        editor.changeDocument(CONFLICTED);

        expect(host.actionNotifier.notices).toHaveLength(2);
    });

    it("offers nothing for a file without markers", async () => {
        const { host, participant } = createParticipant();
        const editor = await host.openSession("/repo/order.bpmn", [participant], {
            content: CLEAN,
        });

        editor.changeDocument(`${CLEAN}\n`);

        expect(host.actionNotifier.notices).toStrictEqual([]);
    });

    it("offers once in each editor of a conflicted file", async () => {
        const { host, participant } = createParticipant();

        await host.openSession("/repo/order.bpmn", [participant], { content: CONFLICTED });
        await host.openSession("/repo/invoice.bpmn", [participant], { content: CONFLICTED });

        expect(host.actionNotifier.notices).toHaveLength(2);
    });

    it("opens the merge view of the editor's file when the user takes the action", async () => {
        const { host, participant, opened } = createParticipant({
            conflictMarkers: "openMergeView",
        });

        await host.openSession("/repo/order.bpmn", [participant], { content: CONFLICTED });

        await vi.waitFor(() => expect(opened).toStrictEqual(["file:///repo/order.bpmn"]));
    });

    it("opens nothing when the user closes the notice", async () => {
        const { host, participant, opened } = createParticipant();

        await host.openSession("/repo/order.bpmn", [participant], { content: CONFLICTED });

        expect(host.actionNotifier.notices).toHaveLength(1);
        expect(opened).toStrictEqual([]);
    });
});
