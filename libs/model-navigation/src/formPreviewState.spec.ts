import { describe, expect, it } from "vitest";
import { reduceFormPreview } from "./formPreviewState";

describe("preview selection decisions", () => {
    it("keeps an automatic panel retryable after explicit refresh despite index loss", () => {
        const state = {
            target: "task",
            reference: "form",
            available: true,
            dismissed: false,
            attempted: true,
            explicit: false,
        };
        const refreshed = reduceFormPreview(state, { kind: "refresh" });
        expect(refreshed).toMatchObject({ action: "keep", state: { explicit: true } });
        expect(
            reduceFormPreview(refreshed.state, {
                kind: "selection",
                target: "task",
                reference: "form",
                available: false,
                visible: true,
            }).action,
        ).toBe("keep");
    });
    it("indicates unavailable references without reading, waits for pending status, and recovers", () => {
        const state = { dismissed: false, attempted: false, explicit: false };
        const pending = reduceFormPreview(state, {
            kind: "selection",
            target: "task",
            reference: "form",
            available: undefined,
        });
        expect(pending.action).toBe("close");
        const missing = reduceFormPreview(pending.state, {
            kind: "selection",
            target: "task",
            reference: "form",
            available: false,
        });
        expect(missing.action).toBe("indicate");
        expect(
            reduceFormPreview(missing.state, {
                kind: "selection",
                target: "task",
                reference: "form",
                available: false,
                visible: true,
            }).action,
        ).toBe("keep");
        expect(
            reduceFormPreview(missing.state, {
                kind: "selection",
                target: "task",
                reference: "form",
                available: true,
                visible: true,
            }).action,
        ).toBe("open");
    });
    it("keeps a pending explicit request alive when availability disappears", () => {
        const initial = {
            target: "task",
            reference: "form",
            dismissed: true,
            attempted: true,
            explicit: false,
        };
        const manual = reduceFormPreview(initial, {
            kind: "manual",
            target: "task",
            available: true,
        });
        expect(
            reduceFormPreview(manual.state, {
                kind: "selection",
                target: "task",
                reference: "form",
                available: false,
                visible: false,
            }),
        ).toEqual({ state: manual.state, action: "keep" });
        expect(reduceFormPreview(manual.state, { kind: "dismiss" }).state.explicit).toBe(false);
        expect(
            reduceFormPreview(manual.state, {
                kind: "selection",
                target: "other",
                reference: "form",
                available: false,
            }),
        ).toMatchObject({ action: "indicate", state: { explicit: false } });
    });
    it.each([
        { target: "task", available: true, reference: "form", action: "open" },
        { target: "other", available: true, reference: "form", action: "keep" },
        { target: "task", available: false, reference: "form", action: "keep" },
        { target: "task", available: true, reference: undefined, action: "keep" },
    ])(
        "$action manual request for $target/$reference ($available)",
        ({ target, available, reference, action }) => {
            const state = {
                target: "task",
                reference,
                dismissed: true,
                attempted: true,
                explicit: false,
            };
            const decision = reduceFormPreview(state, { kind: "manual", target, available });
            expect(decision.action).toBe(action);
            if (action === "open")
                expect(decision).toMatchObject({
                    automatic: false,
                    state: { dismissed: false, attempted: true, explicit: true },
                });
            else expect(decision.state).toEqual(state);
        },
    );
    it("suppresses automatic reopening after dismissal without mutating prior state", () => {
        const state = {
            target: "task",
            reference: "form",
            dismissed: false,
            attempted: true,
            explicit: false,
        };
        const dismissed = reduceFormPreview(state, { kind: "dismiss" });
        expect(dismissed).toEqual({ action: "close", state: { ...state, dismissed: true } });
        expect(state.dismissed).toBe(false);
        expect(
            reduceFormPreview(dismissed.state, {
                kind: "selection",
                target: "task",
                reference: "form",
                available: true,
            }).action,
        ).toBe("keep");
    });
    it("replaces an automatic panel with an indicator when its saved form disappears", () => {
        const state = {
            target: "task",
            reference: "form",
            dismissed: false,
            attempted: true,
            explicit: false,
        };
        expect(
            reduceFormPreview(state, {
                kind: "selection",
                target: "task",
                reference: "form",
                available: false,
                visible: true,
            }),
        ).toMatchObject({ action: "indicate" });
    });
    it.each([
        {
            target: "task",
            reference: "form",
            available: true,
            dismissed: false,
            attempted: false,
            action: "open",
        },
        {
            target: "task",
            reference: "form",
            available: true,
            dismissed: true,
            attempted: false,
            action: "keep",
        },
        {
            target: "task",
            reference: "form",
            available: true,
            dismissed: false,
            attempted: true,
            action: "keep",
        },
        {
            target: "task",
            reference: "form",
            available: false,
            dismissed: false,
            attempted: true,
            action: "indicate",
        },
        {
            target: undefined,
            reference: undefined,
            available: false,
            dismissed: true,
            attempted: true,
            action: "close",
        },
        {
            target: "other",
            reference: "form",
            available: true,
            dismissed: true,
            attempted: true,
            action: "open",
        },
        {
            target: "task",
            reference: "other",
            available: true,
            dismissed: true,
            attempted: true,
            action: "open",
        },
    ])("$action for $target/$reference ($available, $dismissed, $attempted)", (row) => {
        const decision = reduceFormPreview(
            {
                target: "task",
                reference: "form",
                dismissed: row.dismissed,
                attempted: row.attempted,
                explicit: false,
                available: true,
            },
            {
                kind: "selection",
                target: row.target,
                reference: row.reference,
                available: row.available,
            },
        );
        expect(decision.action).toBe(row.action);
        if (row.action === "open")
            expect(decision.state).toMatchObject({ dismissed: false, attempted: true });
        if (row.action === "close") expect(decision.state.attempted).toBe(false);
    });
});
