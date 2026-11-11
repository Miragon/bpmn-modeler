import { describe, expect, it } from "vitest";

import { ElementIdReviewCommand, GenerateElementIdsQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { ElementIdsService } from "./ElementIdsService";

const SWITCH_MODE = "Switch to Design or Implement mode to generate IDs from names.";

function createService() {
    const host = createTestHost();
    const editor = host.openEditor("/work/diagram.bpmn");
    const service = new ElementIdsService(host.store, host.notifier);
    return { service, host, editor, notifier: host.notifier };
}

describe("ElementIdsService.generate", () => {
    it("asks the given editor to open the review of IDs generated from names", async () => {
        const { service, editor } = createService();

        await service.generate(editor.id);

        expect(editor.posted).toHaveLength(1);
        expect(editor.posted[0]).toBeInstanceOf(GenerateElementIdsQuery);
    });

    it("asks only the editor the command targets", async () => {
        const { service, host, editor } = createService();
        const other = host.openEditor("/work/other.bpmn");

        await service.generate(other.id);

        expect(other.postedOfType("GenerateElementIdsQuery")).toHaveLength(1);
        expect(editor.posted).toEqual([]);
    });

    it("rejects for an editor that is not open, so the host can ask for a diagram", async () => {
        const { service, editor, notifier } = createService();

        await expect(service.generate("file:///work/closed.bpmn")).rejects.toThrow(
            "No editor found for id: file:///work/closed.bpmn",
        );

        expect(editor.posted).toEqual([]);
        expect(notifier.infos).toEqual([]);
    });
});

describe("ElementIdsService.reportReview", () => {
    it("tells the user to switch modes when the editor cannot change IDs", () => {
        const { service, notifier } = createService();

        service.reportReview(new ElementIdReviewCommand("unsupported"));

        expect(notifier.infos).toEqual([SWITCH_MODE]);
        expect(notifier.warnings).toEqual([]);
        expect(notifier.errors).toEqual([]);
    });

    it("stays quiet when the review opened, as the review speaks for itself", () => {
        const { service, notifier } = createService();

        service.reportReview(new ElementIdReviewCommand("opened"));

        expect(notifier.infos).toEqual([]);
        expect(notifier.warnings).toEqual([]);
        expect(notifier.errors).toEqual([]);
    });
});
