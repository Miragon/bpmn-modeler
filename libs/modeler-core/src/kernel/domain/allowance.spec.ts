import { describe, expect, it } from "vitest";

import {
    ALLOWANCE_COVERS_TEXT,
    AllowableCode,
    Allowance,
    allowanceKeyOf,
    allowanceOf,
    allowanceOutcome,
    allowanceRowOf,
    allowanceStateOf,
    allowingAllowances,
    isAllowed,
    LOCAL_HOST,
    pendingAllowances,
    repositoryFolderOf,
    revokingAllowance,
} from "./allowance";
import { AllowanceKind } from "./approvalRowKind";
import { CodeApproval } from "./codeApproval";
import { CodeOrigin } from "./repositoryIdentity";

const MAIN: CodeOrigin = {
    kind: "repository",
    commonDir: "/work/repo/.git",
    worktreeRoot: "/work/repo",
};
const TASK: CodeOrigin = {
    kind: "repository",
    commonDir: "/work/repo/.git",
    worktreeRoot: "/work/task",
};
const NO_REPOSITORY: CodeOrigin = { kind: "noRepository" };
const PLUGIN_HASH = "0123456789abcdef".repeat(4);

function codeAt(kind: AllowanceKind, id: string, origin: CodeOrigin, host = ""): AllowableCode {
    return { id, allowance: allowanceOf(kind, id, origin, host) };
}

describe("allowanceOf", () => {
    it.each<{
        behaviour: string;
        kind: AllowanceKind;
        folder: string;
        origin: CodeOrigin;
        allowance: Omit<Allowance, "kind" | "host">;
    }>([
        {
            behaviour: "places a plugin by its folder below the worktree",
            kind: "plugin",
            folder: "/work/repo/.camunda/plugins/trace",
            origin: MAIN,
            allowance: {
                origin: { kind: "repository", path: "/work/repo/.git" },
                addOn: ".camunda/plugins/trace",
            },
        },
        {
            behaviour: "places a plugin in a linked worktree as in the main one",
            kind: "plugin",
            folder: "/work/task/.camunda/plugins/trace",
            origin: TASK,
            allowance: {
                origin: { kind: "repository", path: "/work/repo/.git" },
                addOn: ".camunda/plugins/trace",
            },
        },
        {
            behaviour: "places a hoisted rule package by its install folder and name",
            kind: "rulePackage",
            folder: "/work/repo/node_modules/bpmnlint-plugin-acme",
            origin: MAIN,
            allowance: {
                origin: { kind: "repository", path: "/work/repo/.git" },
                addOn: "node_modules/bpmnlint-plugin-acme",
            },
        },
        {
            behaviour: "places a pnpm rule package without its version, so an update keeps it",
            kind: "rulePackage",
            folder: "/work/repo/node_modules/.pnpm/bpmnlint-plugin-acme@1.2.0/node_modules/bpmnlint-plugin-acme",
            origin: MAIN,
            allowance: {
                origin: { kind: "repository", path: "/work/repo/.git" },
                addOn: "node_modules/bpmnlint-plugin-acme",
            },
        },
        {
            behaviour: "places a nested copy of a rule package as the hoisted one",
            kind: "rulePackage",
            folder: "/work/repo/node_modules/a/node_modules/@acme/bpmnlint-plugin",
            origin: MAIN,
            allowance: {
                origin: { kind: "repository", path: "/work/repo/.git" },
                addOn: "node_modules/@acme/bpmnlint-plugin",
            },
        },
        {
            behaviour: "places a rule package of a workspace package below that package",
            kind: "rulePackage",
            folder: "/work/repo/packages/orders/node_modules/bpmnlint-plugin-acme",
            origin: MAIN,
            allowance: {
                origin: { kind: "repository", path: "/work/repo/.git" },
                addOn: "packages/orders/node_modules/bpmnlint-plugin-acme",
            },
        },
        {
            behaviour: "places a linked rule package by its folder",
            kind: "rulePackage",
            folder: "/work/repo/tools/rules",
            origin: MAIN,
            allowance: {
                origin: { kind: "repository", path: "/work/repo/.git" },
                addOn: "tools/rules",
            },
        },
        {
            behaviour: "places the config's own package at the worktree root",
            kind: "rulePackage",
            folder: "/work/repo",
            origin: MAIN,
            allowance: {
                origin: { kind: "repository", path: "/work/repo/.git" },
                addOn: "",
            },
        },
        {
            behaviour: "takes code in no repository as its own origin",
            kind: "rulePackage",
            folder: "/downloads/rules/node_modules/bpmnlint-plugin-acme",
            origin: NO_REPOSITORY,
            allowance: {
                origin: {
                    kind: "folder",
                    path: "/downloads/rules/node_modules/bpmnlint-plugin-acme",
                },
                addOn: "",
            },
        },
        {
            behaviour: "takes code outside the worktree it was located in as its own origin",
            kind: "plugin",
            folder: "/elsewhere/trace",
            origin: MAIN,
            allowance: { origin: { kind: "folder", path: "/elsewhere/trace" }, addOn: "" },
        },
    ])("$behaviour", ({ kind, folder, origin, allowance }) => {
        expect(allowanceOf(kind, folder, origin, "")).toEqual({ kind, host: "", ...allowance });
    });

    it("keeps the host it was found on", () => {
        expect(allowanceOf("plugin", "/work/repo/p", MAIN, "ssh-remote+box").host).toBe(
            "ssh-remote+box",
        );
    });
});

describe("allowanceKeyOf", () => {
    const main = allowanceOf("plugin", "/work/repo/.camunda/plugins/trace", MAIN, "");

    it.each([
        {
            case: "the same plugin in another worktree",
            other: allowanceOf("plugin", "/work/task/.camunda/plugins/trace", TASK, ""),
            same: true,
        },
        {
            case: "another plugin of the repository",
            other: allowanceOf("plugin", "/work/repo/.camunda/plugins/other", MAIN, ""),
            same: false,
        },
        {
            case: "the same folder as a rule package",
            other: allowanceOf("rulePackage", "/work/repo/.camunda/plugins/trace", MAIN, ""),
            same: false,
        },
        {
            case: "the same path on another host",
            other: allowanceOf(
                "plugin",
                "/work/repo/.camunda/plugins/trace",
                MAIN,
                "dev-container+app",
            ),
            same: false,
        },
        {
            case: "a folder origin spelled like a repository with an empty add-on",
            other: allowanceOf("plugin", "/work/repo/.git", NO_REPOSITORY, ""),
            same: false,
        },
    ])("tells $case apart: same $same", ({ other, same }) => {
        expect(allowanceKeyOf(other) === allowanceKeyOf(main)).toBe(same);
    });

    it.each([
        {
            case: "a repository whose drive letter git and VS Code spell differently",
            upper: allowanceOf(
                "plugin",
                "C:/work/repo/.camunda/plugins/trace",
                {
                    kind: "repository",
                    commonDir: "C:/work/repo/.git",
                    worktreeRoot: "C:/work/repo",
                },
                "",
            ),
            lower: allowanceOf(
                "plugin",
                "c:/work/task/.camunda/plugins/trace",
                {
                    kind: "repository",
                    commonDir: "c:/work/repo/.git",
                    worktreeRoot: "c:/work/task",
                },
                "",
            ),
        },
        {
            case: "a folder origin whose drive letter two hosts spell differently",
            upper: allowanceOf("rulePackage", "C:/rules/acme", NO_REPOSITORY, ""),
            lower: allowanceOf("rulePackage", "c:/rules/acme", NO_REPOSITORY, ""),
        },
    ])("gives $case one key, as Windows ignores the drive letter's case", ({ upper, lower }) => {
        expect(allowanceKeyOf(upper)).toBe(allowanceKeyOf(lower));
    });

    it("tells folders apart whose names differ in case beyond the drive letter", () => {
        expect(
            allowanceKeyOf(allowanceOf("rulePackage", "C:/Rules/acme", NO_REPOSITORY, "")),
        ).not.toBe(allowanceKeyOf(allowanceOf("rulePackage", "c:/rules/acme", NO_REPOSITORY, "")));
    });

    it("stores an allowance as a row the hosts keep unchanged", () => {
        expect(allowanceRowOf(main)).toEqual({
            pluginId: allowanceKeyOf(main),
            contentHash: "allowance-v1:plugin",
        });
    });
});

describe("allowanceStateOf", () => {
    const trace = codeAt("plugin", "/work/task/.camunda/plugins/trace", TASK);
    const traceInMain = codeAt("plugin", "/work/repo/.camunda/plugins/trace", MAIN);

    it.each<{
        behaviour: string;
        rows: CodeApproval[];
        declined?: string[];
        state: ReturnType<typeof allowanceStateOf>;
    }>([
        {
            behaviour: "allows code whose allowance another worktree stored",
            rows: [allowanceRowOf(traceInMain.allowance)],
            state: "allowed",
        },
        {
            behaviour: "allows code with a content row at its own place, whatever its content",
            rows: [{ pluginId: trace.id, contentHash: PLUGIN_HASH }],
            state: "allowed",
        },
        {
            behaviour: "does not take another add-on's allowance",
            rows: [
                allowanceRowOf(
                    codeAt("plugin", "/work/repo/.camunda/plugins/other", MAIN).allowance,
                ),
            ],
            state: "new",
        },
        {
            behaviour: "does not take an allowance marker that names its place, not its key",
            rows: [{ pluginId: trace.id, contentHash: "allowance-v1:plugin" }],
            state: "new",
        },
        {
            behaviour: "does not take a row of an unknown kind at its place",
            rows: [{ pluginId: trace.id, contentHash: "unknown" }],
            state: "new",
        },
        {
            behaviour: "does not take a content row of another kind at its place",
            rows: [{ pluginId: trace.id, contentHash: "bpmnlint-closure-v1:abc" }],
            state: "new",
        },
        {
            behaviour: "does not take a content row at another place",
            rows: [{ pluginId: traceInMain.id, contentHash: PLUGIN_HASH }],
            state: "new",
        },
        {
            behaviour: "does not take a row that names its key under another marker",
            rows: [{ pluginId: allowanceKeyOf(trace.allowance), contentHash: PLUGIN_HASH }],
            state: "new",
        },
        {
            behaviour: "keeps an allowance the user declined this session",
            rows: [],
            declined: [allowanceKeyOf(trace.allowance)],
            state: "declined",
        },
        {
            behaviour: "lets an allowance stored elsewhere win over a decline",
            rows: [allowanceRowOf(trace.allowance)],
            declined: [allowanceKeyOf(trace.allowance)],
            state: "allowed",
        },
        { behaviour: "takes code without any row as new", rows: [], state: "new" },
    ])("$behaviour", ({ rows, declined = [], state }) => {
        expect(allowanceStateOf(trace, rows, new Set(declined))).toBe(state);
        expect(isAllowed(trace, rows)).toBe(state === "allowed");
    });
});

describe("allowingAllowances", () => {
    it("stores one row for the same allowance found in two worktrees", () => {
        const main = codeAt("plugin", "/work/repo/.camunda/plugins/trace", MAIN);
        const task = codeAt("plugin", "/work/task/.camunda/plugins/trace", TASK);
        const other = codeAt("plugin", "/work/repo/.camunda/plugins/other", MAIN);

        expect(allowingAllowances([main, task, other])).toEqual({
            allow: [allowanceRowOf(main.allowance), allowanceRowOf(other.allowance)],
            revoke: [],
        });
    });
});

describe("revokingAllowance", () => {
    const trace = codeAt("plugin", "/work/repo/.camunda/plugins/trace", MAIN);
    const traceInTask = codeAt("plugin", "/work/task/.camunda/plugins/trace", TASK);
    const other = codeAt("plugin", "/work/repo/.camunda/plugins/other", MAIN);
    const contentRow = (pluginId: string): CodeApproval => ({ pluginId, contentHash: PLUGIN_HASH });

    it.each<{
        behaviour: string;
        rows: CodeApproval[];
        located?: [string, Allowance][];
        revoke: string[];
    }>([
        {
            behaviour: "revokes the allowance",
            rows: [allowanceRowOf(trace.allowance)],
            revoke: [allowanceKeyOf(trace.allowance)],
        },
        {
            behaviour: "revokes a content row at its place too, which would allow it again",
            rows: [contentRow(trace.id)],
            revoke: [allowanceKeyOf(trace.allowance), trace.id],
        },
        {
            behaviour: "revokes both when its allowance and a content row at its place are stored",
            rows: [allowanceRowOf(trace.allowance), contentRow(trace.id)],
            revoke: [allowanceKeyOf(trace.allowance), trace.id],
        },
        {
            behaviour: "leaves a content row of another kind at its place",
            rows: [{ pluginId: trace.id, contentHash: "bpmnlint-closure-v1:abc" }],
            revoke: [allowanceKeyOf(trace.allowance)],
        },
        {
            behaviour: "revokes a content row at another place located as the same allowance",
            rows: [contentRow(traceInTask.id)],
            located: [[traceInTask.id, traceInTask.allowance]],
            revoke: [allowanceKeyOf(trace.allowance), traceInTask.id],
        },
        {
            behaviour: "leaves a content row located as another allowance",
            rows: [contentRow(other.id)],
            located: [[other.id, other.allowance]],
            revoke: [allowanceKeyOf(trace.allowance)],
        },
        {
            behaviour: "leaves a content row of another kind located as the same place",
            rows: [{ pluginId: traceInTask.id, contentHash: "bpmnlint-closure-v1:abc" }],
            located: [[traceInTask.id, traceInTask.allowance]],
            revoke: [allowanceKeyOf(trace.allowance)],
        },
        {
            behaviour: "leaves a content row nobody located at another place",
            rows: [contentRow(traceInTask.id)],
            revoke: [allowanceKeyOf(trace.allowance)],
        },
        {
            behaviour: "names the content row at its place once when it is located too",
            rows: [contentRow(trace.id)],
            located: [[trace.id, trace.allowance]],
            revoke: [allowanceKeyOf(trace.allowance), trace.id],
        },
    ])("$behaviour", ({ rows, located = [], revoke }) => {
        expect(revokingAllowance(trace, rows, new Map(located))).toEqual({ allow: [], revoke });
    });

    it("takes no content row on a remote host, where it may have been given on another machine", () => {
        const remote = codeAt("plugin", trace.id, MAIN, "ssh-remote+box");
        const remoteInTask = codeAt("plugin", traceInTask.id, TASK, "ssh-remote+box");

        expect(
            revokingAllowance(
                remote,
                [contentRow(remote.id), contentRow(remoteInTask.id)],
                new Map([[remoteInTask.id, remoteInTask.allowance]]),
            ),
        ).toEqual({ allow: [], revoke: [allowanceKeyOf(remote.allowance)] });
    });
});

describe("isAllowed on another host", () => {
    it("takes a content row at its place only on the local host", () => {
        const rows = [{ pluginId: "/work/repo/p", contentHash: PLUGIN_HASH }];

        expect(isAllowed(codeAt("plugin", "/work/repo/p", MAIN, LOCAL_HOST), rows)).toBe(true);
        expect(isAllowed(codeAt("plugin", "/work/repo/p", MAIN, "ssh-remote+box"), rows)).toBe(
            false,
        );
    });

    it("takes the allowance of its host", () => {
        const remote = codeAt("plugin", "/work/repo/p", MAIN, "ssh-remote+box");

        expect(isAllowed(remote, [allowanceRowOf(remote.allowance)])).toBe(true);
    });
});

describe("pendingAllowances", () => {
    const traceInTask = codeAt("plugin", "/work/task/.camunda/plugins/trace", TASK);
    const trace = codeAt("plugin", "/work/repo/.camunda/plugins/trace", MAIN);
    const other = codeAt("plugin", "/work/repo/.camunda/plugins/other", MAIN);
    const third = codeAt("plugin", "/work/repo/.camunda/plugins/third", MAIN);

    it.each<{
        behaviour: string;
        rows?: CodeApproval[];
        answered?: string[];
        pending: AllowableCode[];
    }>([
        {
            behaviour: "keeps one place per allowance, the first found",
            pending: [traceInTask, other, third],
        },
        {
            behaviour: "leaves an allowance answered this session",
            answered: [allowanceKeyOf(trace.allowance)],
            pending: [other, third],
        },
        {
            behaviour: "leaves an allowed allowance",
            rows: [allowanceRowOf(other.allowance)],
            pending: [traceInTask, third],
        },
        {
            behaviour: "counts a local content row as allowing its place",
            rows: [{ pluginId: third.id, contentHash: PLUGIN_HASH }],
            pending: [traceInTask, other],
        },
        {
            behaviour:
                "keeps the next place of an allowance whose first place a content row allows",
            rows: [{ pluginId: traceInTask.id, contentHash: PLUGIN_HASH }],
            pending: [trace, other, third],
        },
    ])("$behaviour", ({ rows = [], answered = [], pending }) => {
        expect(
            pendingAllowances([traceInTask, trace, other, third], rows, new Set(answered)),
        ).toEqual(pending);
    });
});

describe("repositoryFolderOf", () => {
    const allowanceIn = (origin: Allowance["origin"]): Allowance => ({
        kind: "plugin",
        host: LOCAL_HOST,
        origin,
        addOn: "",
    });

    it.each<{ behaviour: string; origin: Allowance["origin"]; folder: string | undefined }>([
        {
            behaviour: "takes the folder that holds the .git folder",
            origin: { kind: "repository", path: "/x/app/.git" },
            folder: "/x/app",
        },
        {
            behaviour: "takes a bare repository as its own folder",
            origin: { kind: "repository", path: "/x/app.git" },
            folder: "/x/app.git",
        },
        {
            behaviour: "names no repository for a folder origin",
            origin: { kind: "folder", path: "/x/app/.git" },
            folder: undefined,
        },
    ])("$behaviour", ({ origin, folder }) => {
        expect(repositoryFolderOf(allowanceIn(origin))).toBe(folder);
    });
});

describe("ALLOWANCE_COVERS_TEXT", () => {
    it("says that an allowance follows later changes", () => {
        expect(ALLOWANCE_COVERS_TEXT).toBe(
            "covers it in every worktree of its repository, or in its folder outside a repository, later changes included",
        );
    });
});

describe("allowanceOutcome", () => {
    const main = codeAt("plugin", "/work/repo/.camunda/plugins/trace", MAIN);
    const task = codeAt("plugin", "/work/task/.camunda/plugins/trace", TASK);
    const other = codeAt("plugin", "/work/repo/.camunda/plugins/other", MAIN);

    it("allows every pending place of a checked allowance and declines the rest", () => {
        const outcome = allowanceOutcome([main, task, other], {
            kind: "checked",
            ids: [task.id],
        });

        expect(outcome.allowed).toEqual([main, task]);
        expect([...outcome.answers]).toEqual([[allowanceKeyOf(other.allowance), "declined"]]);
    });

    it("leaves every pending allowance to a view once, allowing none", () => {
        const outcome = allowanceOutcome([main, task, other], { kind: "leftForView" });

        expect(outcome.allowed).toEqual([]);
        expect([...outcome.answers]).toEqual([
            [allowanceKeyOf(main.allowance), "leftForView"],
            [allowanceKeyOf(other.allowance), "leftForView"],
        ]);
    });
});
