import { describe, expect, it, vi } from "vitest";

import { ElementIdProposalsCommand } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { ElementIdReviewParticipant } from "./ElementIdReviewParticipant";
import { ElementIdsService } from "./ElementIdsService";

describe("ElementIdReviewParticipant", () => {
    it("closes the host's review panel when the review's editor closes", async () => {
        const host = createTestHost();
        const panel = { show: vi.fn(), close: vi.fn() };
        const service = new ElementIdsService(host.store, host.notifier, panel);
        const editor = await host.openSession("/work/order.bpmn", [
            new ElementIdReviewParticipant(service),
        ]);
        await service.generate(editor.id);
        service.reportProposals(editor.id, new ElementIdProposalsCommand("listed", [], []));

        editor.dispose();

        expect(panel.close).toHaveBeenCalledOnce();
    });
});
