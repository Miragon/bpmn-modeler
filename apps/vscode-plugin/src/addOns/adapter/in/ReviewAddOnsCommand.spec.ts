import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    commands: { registerCommand: vi.fn(() => ({ dispose: vi.fn() })) },
}));

import { commands } from "vscode";
import { RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";
import { REVIEW_ADD_ONS_CMD, ReviewAddOnsCommand } from "./ReviewAddOnsCommand";

/** A view whose focus command fails, as through a keybinding while no folder is open. */
const NO_VIEW = () =>
    Promise.reject(new Error("command 'bpmn-modeler.addOnsView.focus' not found"));

function reviewCommand(focus: () => Promise<void> = async () => undefined) {
    const steps: string[] = [];
    const logger = new RecordingNotifier();
    const command = new ReviewAddOnsCommand(
        {
            focus: async () => {
                await focus();
                steps.push("focus");
            },
        },
        { revealNeedsReview: () => void steps.push("revealNeedsReview") },
        logger,
    );
    return { command, steps, logger };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("ReviewAddOnsCommand", () => {
    it("shows the Add-ons view, then asks the core for what needs review", async () => {
        const { command, steps, logger } = reviewCommand();

        await command.run();

        expect(steps).toEqual(["focus", "revealNeedsReview"]);
        expect(logger.logs).toEqual([]);
    });

    it("asks nothing and logs one warning when the view cannot be shown", async () => {
        const { command, steps, logger } = reviewCommand(NO_VIEW);

        await command.run();

        expect(steps).toEqual([]);
        expect(logger.logged("warning")).toEqual([
            "The Add-ons view did not open: Error: command 'bpmn-modeler.addOnsView.focus' not found",
        ]);
        expect(logger.warnings).toEqual([]);
    });

    it("registers Review Add-ons as a command that runs it", async () => {
        const { command, steps } = reviewCommand();
        const context = { subscriptions: [] as unknown[] };

        command.register(context as never);
        const [[id, handler]] = vi.mocked(commands.registerCommand).mock.calls;
        await handler();

        expect(id).toBe(REVIEW_ADD_ONS_CMD);
        expect(REVIEW_ADD_ONS_CMD).toBe("bpmn-modeler.reviewAddOns");
        expect(context.subscriptions).toHaveLength(1);
        expect(steps).toEqual(["focus", "revealNeedsReview"]);
    });
});
