import { describe, expect, it, vi } from "vitest";

import {
    createTestHost,
    FakeConflictVersionsSource,
    RecordingMergeCommandAvailability,
    StagedConflict,
} from "../../testing";
import { ResolvableConflictsService } from "./ResolvableConflictsService";

const ROOT = "file:///repo";
const ORDER = `${ROOT}/order.bpmn`;
const INVOICE = `${ROOT}/invoice.bpmn`;

const bothSides = (fileUri: string): StagedConflict => ({
    fileUri,
    stages: { base: "<base/>", current: "<current/>", incoming: "<incoming/>" },
});

function startService(...conflicts: StagedConflict[]) {
    const { notifier } = createTestHost();
    const source = new FakeConflictVersionsSource();
    conflicts.forEach((conflict) => source.conflict(ROOT, conflict));
    const availability = new RecordingMergeCommandAvailability();
    const service = new ResolvableConflictsService(source, availability, notifier);
    const subscription = service.start();
    return { source, availability, subscription };
}

describe("ResolvableConflictsService", () => {
    it("lists only BPMN files with both sides", async () => {
        const { availability } = startService(
            bothSides(ORDER),
            { fileUri: `${ROOT}/deleted.bpmn`, stages: { base: "<base/>", current: "<a/>" } },
            bothSides(`${ROOT}/notes.txt`),
        );

        await vi.waitFor(() => expect(availability.resolvable).toStrictEqual([ORDER]));
    });

    it("reads a file's stages once while it stays conflicted, and never a non-BPMN file's", async () => {
        const { source, availability } = startService(
            bothSides(ORDER),
            bothSides(`${ROOT}/notes.txt`),
        );
        await vi.waitFor(() => expect(availability.resolvable).toStrictEqual([ORDER]));

        await source.gitNotices();
        await source.gitNotices();

        expect(source.reads.get(ORDER)).toBe(1);
        expect(source.reads.get(`${ROOT}/notes.txt`)).toBeUndefined();
    });

    it("drops a file that left Merge Changes", async () => {
        const { source, availability } = startService(bothSides(ORDER), bothSides(INVOICE));
        await vi.waitFor(() => expect(availability.resolvable).toHaveLength(2));

        source.resolve(ROOT, ORDER);
        await source.gitNotices();

        expect(availability.resolvable).toStrictEqual([INVOICE]);
    });

    it("clears the list once the last BPMN conflict is resolved", async () => {
        const { source, availability } = startService(bothSides(ORDER));
        await vi.waitFor(() => expect(availability.resolvable).toStrictEqual([ORDER]));

        source.resolve(ROOT, ORDER);
        await source.gitNotices();

        expect(availability.resolvable).toStrictEqual([]);
    });

    it("reads a file again once it conflicts again", async () => {
        const { source, availability } = startService(bothSides(ORDER));
        await vi.waitFor(() => expect(availability.resolvable).toStrictEqual([ORDER]));
        source.resolve(ROOT, ORDER);
        await source.gitNotices();

        source.conflict(ROOT, bothSides(ORDER));
        await source.gitNotices();

        await vi.waitFor(() => expect(availability.resolvable).toStrictEqual([ORDER]));
        expect(source.reads.get(ORDER)).toBe(2);
    });

    it("tells the host nothing new while the list stays the same", async () => {
        const { source, availability } = startService(bothSides(ORDER));
        await vi.waitFor(() => expect(availability.resolvable).toStrictEqual([ORDER]));
        const told = availability.lists.length;

        await source.gitNotices();

        expect(availability.lists).toHaveLength(told);
    });

    it("lets go of Git once stopped", () => {
        const { source, subscription } = startService(bothSides(ORDER));

        subscription.dispose();

        expect(source.gitListenerCount()).toBe(0);
    });
});
