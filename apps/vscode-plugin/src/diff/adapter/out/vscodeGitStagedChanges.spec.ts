import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeGitFake"));

import {
    closeRepository,
    disableGit,
    removeGit,
    resetVscodeGit,
    runGit,
    stageInGit,
    stopGit,
    unstageInGit,
} from "../../../__fixtures__/vscodeGitFake";

import { gitStagedChanges } from "./vscodeGitStagedChanges";

const ROOT = "file:///repo";
const FILE = "/repo/models/order.bpmn";
const FILE_URI = "file:///repo/models/order.bpmn";
const OTHER_URI = "file:///repo/models/invoice.bpmn";

beforeEach(() => {
    resetVscodeGit();
    runGit();
    // Opens the repository: staging and unstaging leaves it without staged changes.
    stageInGit(ROOT, OTHER_URI);
    unstageInGit(ROOT, OTHER_URI);
});

describe("gitStagedChanges", () => {
    it("tells a file with nothing staged from one with staged changes, as Git's state stands", () => {
        const before = gitStagedChanges(FILE);
        stageInGit(ROOT, FILE_URI);
        const staged = gitStagedChanges(FILE);
        unstageInGit(ROOT, FILE_URI);

        expect([before, staged, gitStagedChanges(FILE)]).toStrictEqual([false, true, false]);
    });

    it("reads a file as unstaged while only another file has staged changes", () => {
        stageInGit(ROOT, OTHER_URI);

        expect(gitStagedChanges(FILE)).toBe(false);
    });

    it.each<[string, () => void]>([
        ["Git is missing", removeGit],
        ["Git is disabled", disableGit],
        ["the Git extension does not run yet", stopGit],
        ["Git has the file's repository closed", () => closeRepository(ROOT)],
    ])("cannot tell while %s", (_case, arrange) => {
        stageInGit(ROOT, FILE_URI);

        arrange();

        expect(gitStagedChanges(FILE)).toBeUndefined();
    });

    it("cannot tell for a file no repository holds", () => {
        expect(gitStagedChanges("/elsewhere/order.bpmn")).toBeUndefined();
    });
});
