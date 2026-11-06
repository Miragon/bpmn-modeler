import { describe, expect, it } from "vitest";

import type { MissedPartnerReplay } from "../../domain/missedPartnerReplay";
import { type MissedPartnerUseCases, runMissedPartnerCli } from "./missedPartnerCli";

const REPLAY: MissedPartnerReplay = {
    head: "abc",
    replayedCommits: 200,
    lookAhead: 10,
    outcomes: [],
};

function run(args: readonly string[], overrides: Partial<MissedPartnerUseCases> = {}) {
    const output = { out: "", error: "" };
    const exitCode = runMissedPartnerCli(
        args,
        { replay: () => REPLAY, ...overrides },
        { out: (text) => (output.out += text), error: (text) => (output.error += text) },
    );
    return { exitCode, ...output };
}

describe("the missed-partner command", () => {
    it("prints the replay table", () => {
        const result = run(["replay"]);

        expect(result.exitCode).toBe(0);
        expect(result.out).toContain("HEAD `abc`, 200 replayed commits");
    });

    it.each([
        { case: "no command", args: [], problem: "needs replay" },
        { case: "an unknown command", args: ["record"], problem: "unexpected argument record" },
        { case: "an extra argument", args: ["replay", "x"], problem: "unexpected argument x" },
    ])("rejects $case with the usage", ({ args, problem }) => {
        expect(run(args)).toEqual({
            exitCode: 2,
            out: "",
            error: `fitness missed-partner: ${problem}\nusage: fitness missed-partner replay\n`,
        });
    });

    it("fails on a history too short to replay", () => {
        const result = run(["replay"], {
            replay: () => {
                throw new Error("900 first-parent commits reach back from here");
            },
        });

        expect(result).toEqual({
            exitCode: 1,
            out: "",
            error: "fitness missed-partner: 900 first-parent commits reach back from here\n",
        });
    });
});
