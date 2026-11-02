import { describe, expect, it } from "vitest";
import { reduceFormPreview } from "./formPreviewState";

describe("preview selection decisions", () => {
    const selected = {
        kind: "selection",
        target: "task",
        reference: "form",
        available: true,
    } as const;
    const initial = { dismissed: false, attempted: false, explicit: false };

    it.each([true, false, undefined])(
        "tracks the selection without automatic opening or indicators when disabled (available: %s)",
        (available) => {
            const decision = reduceFormPreview(initial, { ...selected, available }, false);

            expect(decision).toMatchObject({
                action: "close",
                state: { target: "task", reference: "form", attempted: false, explicit: false },
            });
            expect(initial).toEqual({ dismissed: false, attempted: false, explicit: false });
        },
    );

    it.each([
        { available: true, visible: false, action: "open" },
        { available: true, visible: true, action: "open" },
        { available: false, visible: false, action: "indicate" },
        { available: false, visible: true, action: "indicate" },
    ])(
        "closes an automatic $action when disabled and permits re-enabling (visible: $visible)",
        ({ available, visible, action }) => {
            const selection = { ...selected, available };
            const opened = reduceFormPreview(initial, selection);
            expect(opened.action).toBe(action);

            const disabled = reduceFormPreview(opened.state, { ...selection, visible }, false);
            expect(disabled).toMatchObject({ action: "close", state: { attempted: false } });
            expect(reduceFormPreview(disabled.state, selection, true).action).toBe(action);
        },
    );

    it.each([false, true])(
        "keeps late availability updates from opening an automatic preview while disabled (%s)",
        (available) => {
            const pending = reduceFormPreview(initial, { ...selected, available: undefined });
            const disabled = reduceFormPreview(
                pending.state,
                { ...selected, available: undefined },
                false,
            );

            expect(
                reduceFormPreview(disabled.state, { ...selected, available }, false),
            ).toMatchObject({ action: "close", state: { attempted: false } });
        },
    );

    it.each([false, true])(
        "allows manual preview while disabled and keeps it across preference changes (visible: %s)",
        (visible) => {
            const disabled = reduceFormPreview(initial, selected, false);
            const manual = reduceFormPreview(
                disabled.state,
                { kind: "manual", target: "task", available: true },
                false,
            );

            expect(manual).toMatchObject({ action: "open", automatic: false });
            for (const automatic of [true, false]) {
                expect(
                    reduceFormPreview(manual.state, { ...selected, visible }, automatic),
                ).toEqual({ action: "keep", state: manual.state });
            }
        },
    );

    it("keeps a refreshed automatic panel explicit when automatic preview is disabled", () => {
        const opened = reduceFormPreview(initial, selected);
        const refreshed = reduceFormPreview(opened.state, { kind: "refresh" });

        expect(reduceFormPreview(refreshed.state, { ...selected, visible: true }, false)).toEqual({
            action: "keep",
            state: refreshed.state,
        });
    });

    it.each([
        { target: "other", reference: "form" },
        { target: "task", reference: "other" },
    ])(
        "preserves dismissal through toggles until selection or reference changes ($target/$reference)",
        ({ target, reference }) => {
            const opened = reduceFormPreview(initial, selected);
            const dismissed = reduceFormPreview(opened.state, { kind: "dismiss" });
            const disabled = reduceFormPreview(dismissed.state, selected, false);

            expect(disabled.state.dismissed).toBe(true);
            expect(reduceFormPreview(disabled.state, selected, true).action).toBe("keep");
            const changed = reduceFormPreview(
                disabled.state,
                { ...selected, target, reference },
                false,
            );
            expect(changed).toMatchObject({
                action: "close",
                state: { dismissed: false, attempted: false },
            });
            expect(
                reduceFormPreview(changed.state, { ...selected, target, reference }, true),
            ).toMatchObject({ action: "open", automatic: true });
        },
    );

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
