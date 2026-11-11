import { describe, expect, it } from "vitest";

import { AllowableCode, allowanceOf, allowanceRowOf, LOCAL_HOST } from "./allowance";
import { CodeApproval } from "./codeApproval";
import { askedInWorkspace, runsInWorkspace } from "./workspaceTrust";

const PLUGIN: AllowableCode = {
    id: "/work/.camunda/plugins/trace",
    allowance: allowanceOf(
        "plugin",
        "/work/.camunda/plugins/trace",
        { kind: "repository", commonDir: "/work/.git", worktreeRoot: "/work" },
        LOCAL_HOST,
    ),
};
const ALLOWED: readonly CodeApproval[] = [allowanceRowOf(PLUGIN.allowance)];

describe("runsInWorkspace", () => {
    it.each<{ behaviour: string; rows: readonly CodeApproval[]; trusted: boolean; runs: boolean }>([
        {
            behaviour: "runs allowed code in a trusted workspace",
            rows: ALLOWED,
            trusted: true,
            runs: true,
        },
        { behaviour: "runs no code that is not allowed", rows: [], trusted: true, runs: false },
        {
            behaviour: "runs no allowed code in a workspace the user did not trust",
            rows: ALLOWED,
            trusted: false,
            runs: false,
        },
        {
            behaviour: "runs nothing untrusted and not allowed",
            rows: [],
            trusted: false,
            runs: false,
        },
    ])("$behaviour", ({ rows, trusted, runs }) => {
        expect(runsInWorkspace(PLUGIN, rows, trusted)).toBe(runs);
    });
});

describe("askedInWorkspace", () => {
    it.each<{ behaviour: string; trusted: boolean; asked: readonly string[] }>([
        {
            behaviour: "asks about every pending add-on in a trusted workspace",
            trusted: true,
            asked: ["a", "b"],
        },
        {
            behaviour: "asks nothing in a workspace the user did not trust",
            trusted: false,
            asked: [],
        },
    ])("$behaviour", ({ trusted, asked }) => {
        expect(askedInWorkspace(["a", "b"], trusted)).toEqual(asked);
    });
});
