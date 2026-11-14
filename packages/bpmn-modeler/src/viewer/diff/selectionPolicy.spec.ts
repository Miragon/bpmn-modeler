import { describe, expect, it } from "vitest";

import { UserChangeGuard } from "./selectionPolicy";

type Observed = { positioning: boolean; selection: boolean };

function observe(guard: UserChangeGuard): Observed {
    return {
        positioning: guard.isUserPositioning(),
        selection: guard.isUserSelectionChange(),
    };
}

describe("UserChangeGuard", () => {
    it("takes changes outside the pane's own actions as the user's", () => {
        expect(observe(new UserChangeGuard())).toEqual({ positioning: true, selection: true });
    });

    it.each<
        [string, (guard: UserChangeGuard, record: () => void) => Promise<void> | void, Observed]
    >([
        [
            "a selection the pane makes itself",
            (guard, record) => guard.selectProgrammatically(record),
            { positioning: true, selection: false },
        ],
        [
            "a selection dropped while the pane positions itself",
            (guard, record) => guard.positionProgrammatically(record),
            { positioning: false, selection: false },
        ],
        [
            "a selection an import drops before it settles",
            (guard, record) =>
                guard.selectProgrammaticallyUntilDone(async () => {
                    await Promise.resolve();
                    record();
                }),
            { positioning: true, selection: false },
        ],
        [
            "an action nested in another",
            (guard, record) =>
                guard.positionProgrammatically(() => {
                    guard.positionProgrammatically(() => undefined);
                    record();
                }),
            { positioning: false, selection: false },
        ],
    ])("does not take %s as the user's", async (_case, act, expected) => {
        const guard = new UserChangeGuard();
        let observed: Observed | undefined;

        await act(guard, () => {
            observed = observe(guard);
        });

        expect(observed).toEqual(expected);
        expect(observe(guard)).toEqual({ positioning: true, selection: true });
    });

    it.each<[string, (guard: UserChangeGuard) => Promise<void> | void]>([
        [
            "positioning",
            (guard) =>
                guard.positionProgrammatically(() => {
                    throw new Error("boom");
                }),
        ],
        [
            "selecting",
            (guard) =>
                guard.selectProgrammatically(() => {
                    throw new Error("boom");
                }),
        ],
        [
            "an import",
            (guard) =>
                guard.selectProgrammaticallyUntilDone(() => Promise.reject(new Error("boom"))),
        ],
    ])("hands later changes back to the user after %s fails", async (_case, act) => {
        const guard = new UserChangeGuard();

        await expect(async () => act(guard)).rejects.toThrow("boom");

        expect(observe(guard)).toEqual({ positioning: true, selection: true });
    });
});
