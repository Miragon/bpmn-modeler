import { afterEach, describe, expect, it, vi } from "vitest";

import { HOST_SHOW_REPLY_DEADLINE_MS, METHODS } from "../../../protocol/domain/descriptor";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcAddOnViewReveal } from "./RpcAddOnViewReveal";

const ROWS = ["plugin:/work/.camunda/plugins/resize-tasks"];

interface SentFrame {
    readonly id: number;
    readonly method: string;
    readonly params: unknown;
}

function revealOverRpc({ connected = true } = {}) {
    const frames: SentFrame[] = [];
    const logged: string[] = [];
    const revealed: (readonly string[])[] = [];
    const rpc = new Rpc((line) => frames.push(JSON.parse(line)));
    const view = new RpcAddOnViewReveal(rpc, (message) => logged.push(message));
    if (connected) view.connect({ reveal: (addOnIds) => revealed.push(addOnIds) });
    const answer = (reply: object) =>
        rpc.handleLine(JSON.stringify({ id: frames[0]!.id, ...reply }));
    return { rpc, view, frames, logged, revealed, answer };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("RpcAddOnViewReveal", () => {
    it("answers false and asks the host nothing before the catalog is connected", async () => {
        const { view, frames } = revealOverRpc({ connected: false });

        await expect(view.reveal(ROWS)).resolves.toBe(false);
        expect(frames).toEqual([]);
    });

    it("asks the host to show its view, without the rows, and reveals them once it says shown", async () => {
        const { view, frames, revealed, answer } = revealOverRpc();

        const shown = view.reveal(ROWS);

        expect(frames).toEqual([{ id: 1, method: METHODS.addOnsReveal, params: {} }]);
        expect(revealed).toEqual([]);
        await answer({ result: { shown: true } });
        await expect(shown).resolves.toBe(true);
        expect(revealed).toEqual([ROWS]);
    });

    it("reveals nothing when the host says it did not show its view", async () => {
        const { view, revealed, answer } = revealOverRpc();

        const shown = view.reveal(ROWS);
        await answer({ result: { shown: false } });

        await expect(shown).resolves.toBe(false);
        expect(revealed).toEqual([]);
    });

    it("answers false and logs why when the host answers with an error", async () => {
        const { view, logged, revealed, answer } = revealOverRpc();

        const shown = view.reveal(ROWS);
        await answer({ error: "tool window gone" });

        await expect(shown).resolves.toBe(false);
        expect(revealed).toEqual([]);
        expect(logged).toEqual([expect.stringContaining("tool window gone")]);
    });

    it("answers false once the host has not answered within the show deadline", async () => {
        vi.useFakeTimers();
        const { view, revealed } = revealOverRpc();

        const shown = view.reveal(ROWS);
        vi.advanceTimersByTime(HOST_SHOW_REPLY_DEADLINE_MS);

        await expect(shown).resolves.toBe(false);
        expect(revealed).toEqual([]);
    });

    it("answers false once the host can no longer answer", async () => {
        const { rpc, view } = revealOverRpc();

        const shown = view.reveal(ROWS);
        rpc.handleEnd();

        await expect(shown).resolves.toBe(false);
    });

    it("answers false for a reply in no shape it knows", async () => {
        const { view, revealed, answer } = revealOverRpc();

        const shown = view.reveal(ROWS);
        await answer({ result: {} });

        await expect(shown).resolves.toBe(false);
        expect(revealed).toEqual([]);
    });
});
