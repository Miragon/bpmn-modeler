import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeFake = vi.hoisted(() => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    return {
        registered,
        module: {
            commands: {
                registerCommand: (id: string, callback: (...args: unknown[]) => unknown) => {
                    registered.set(id, callback);
                    return { dispose: () => registered.delete(id) };
                },
            },
        },
    };
});

vi.mock("vscode", () => vscodeFake.module);

import type { ElementIdsService } from "@miragon/bpmn-modeler-core";
import type { ExtensionContext } from "vscode";

import {
    APPLY_ELEMENT_IDS_CMD,
    DISCARD_ELEMENT_IDS_CMD,
    ElementIdReviewController,
    REVEAL_ELEMENT_ID_ROW_CMD,
} from "./ElementIdReviewController";

function setUp() {
    let reportChecks: (ids: string[], checked: boolean) => void = () => {};
    const review = {
        onDidChangeChecks: (listener: typeof reportChecks) => {
            reportChecks = listener;
            return { dispose: vi.fn() };
        },
        dispose: vi.fn(),
    };
    const elementIds = {
        apply: vi.fn(async () => undefined),
        discard: vi.fn(async () => undefined),
        reveal: vi.fn(async () => undefined),
        setChecked: vi.fn(async () => undefined),
    };
    const logger = { logError: vi.fn() };
    const context = { subscriptions: [] as { dispose(): void }[] };
    new ElementIdReviewController(
        review,
        elementIds as unknown as ElementIdsService,
        logger,
    ).register(context as unknown as ExtensionContext);
    return {
        elementIds,
        logger,
        context,
        review,
        run: (id: string, ...args: unknown[]) => vscodeFake.registered.get(id)!(...args),
        reportChecks: (ids: string[], checked: boolean) => reportChecks(ids, checked),
    };
}

beforeEach(() => {
    vscodeFake.registered.clear();
});

describe("ElementIdReviewController", () => {
    it("applies and discards the review from the panel's title actions", async () => {
        const { elementIds, run } = setUp();

        await run(APPLY_ELEMENT_IDS_CMD);
        await run(DISCARD_ELEMENT_IDS_CMD);

        expect(elementIds.apply).toHaveBeenCalledOnce();
        expect(elementIds.discard).toHaveBeenCalledOnce();
    });

    it("reveals the element of a clicked row", async () => {
        const { elementIds, run } = setUp();

        await run(REVEAL_ELEMENT_ID_ROW_CMD, "Participant_1");

        expect(elementIds.reveal).toHaveBeenCalledExactlyOnceWith("Participant_1");
    });

    it("hands each checkbox change the panel reports to the core", async () => {
        const { elementIds, reportChecks } = setUp();

        reportChecks(["Activity_1", "Activity_2"], false);
        reportChecks(["Event_1"], true);
        await vi.waitFor(() => expect(elementIds.setChecked).toHaveBeenCalledTimes(2));

        expect(elementIds.setChecked.mock.calls).toEqual([
            [["Activity_1", "Activity_2"], false],
            [["Event_1"], true],
        ]);
    });

    it("logs a failed action instead of letting VS Code report the command", async () => {
        const { elementIds, logger, run } = setUp();
        const failure = new Error("No editor found for id: order.bpmn");
        elementIds.apply.mockRejectedValueOnce(failure);

        await run(APPLY_ELEMENT_IDS_CMD);

        expect(logger.logError).toHaveBeenCalledExactlyOnceWith(failure);
    });

    it("disposes its commands, its listener and the panel with the extension", () => {
        const { context, review } = setUp();

        context.subscriptions.forEach((subscription) => subscription.dispose());

        expect(vscodeFake.registered.size).toBe(0);
        expect(review.dispose).toHaveBeenCalledOnce();
    });
});
