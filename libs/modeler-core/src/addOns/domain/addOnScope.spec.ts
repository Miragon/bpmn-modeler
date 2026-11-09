import { describe, expect, it } from "vitest";

import {
    HashContext,
    isHashWanted,
    leavesToView,
    missedRowIds,
    configAreaDirsToList,
    rulePackageDirsToList,
    rulePackageIdsToList,
} from "./addOnScope";

const FOLDERS = ["/work", "/other"];

describe("configAreaDirsToList", () => {
    it.each<{ case: string; knownDirs: string[]; dirs: string[] }>([
        {
            case: "each folder's own plugins folder, with nothing known",
            knownDirs: [],
            dirs: ["/work/.camunda/plugins", "/other/.camunda/plugins"],
        },
        {
            case: "a known nested plugins folder inside a folder",
            knownDirs: ["/work/orders/.camunda/plugins"],
            dirs: [
                "/work/.camunda/plugins",
                "/other/.camunda/plugins",
                "/work/orders/.camunda/plugins",
            ],
        },
        {
            case: "no known plugins folder outside every folder",
            knownDirs: ["/elsewhere/.camunda/plugins", "/work2/.camunda/plugins"],
            dirs: ["/work/.camunda/plugins", "/other/.camunda/plugins"],
        },
    ])("lists $case", ({ knownDirs, dirs }) => {
        expect(
            configAreaDirsToList({
                folders: FOLDERS,
                rootDirs: ["/work/.camunda/plugins", "/other/.camunda/plugins"],
                knownDirs,
            }),
        ).toEqual(dirs);
    });
});

describe("missedRowIds", () => {
    it.each<{ case: string; owned: string[]; listed: string[]; ids: string[] }>([
        {
            case: "a row inside a folder that discovery missed",
            owned: ["/work/.camunda/plugins/gone"],
            listed: [],
            ids: ["/work/.camunda/plugins/gone"],
        },
        {
            case: "no row discovery listed",
            owned: ["/work/.camunda/plugins/a"],
            listed: ["/work/.camunda/plugins/a"],
            ids: [],
        },
        {
            case: "no row outside every folder",
            owned: ["/elsewhere/.camunda/plugins/a"],
            listed: [],
            ids: [],
        },
        {
            case: "a row once though stored twice",
            owned: ["/other/.camunda/plugins/a", "/other/.camunda/plugins/a"],
            listed: [],
            ids: ["/other/.camunda/plugins/a"],
        },
    ])("reads $case", ({ owned, listed, ids }) => {
        expect(missedRowIds(owned, listed, FOLDERS)).toEqual(ids);
    });
});

describe("rulePackageDirsToList", () => {
    it.each<{ case: string; lintConfigDirs: string[]; dirs: string[] }>([
        { case: "each folder", lintConfigDirs: [], dirs: FOLDERS },
        {
            case: "a lint config folder inside a folder",
            lintConfigDirs: ["/work/orders"],
            dirs: [...FOLDERS, "/work/orders"],
        },
        {
            case: "no lint config folder outside every folder",
            lintConfigDirs: ["/elsewhere"],
            dirs: FOLDERS,
        },
    ])("reads the node_modules of $case", ({ lintConfigDirs, dirs }) => {
        expect(rulePackageDirsToList(FOLDERS, lintConfigDirs)).toEqual(dirs);
    });
});

describe("rulePackageIdsToList", () => {
    const ACME = "/work/node_modules/bpmnlint-plugin-acme";

    it.each<{ case: string; installed: string[]; seen: string[]; owned: string[]; ids: string[] }>([
        {
            case: "every source, each id once",
            installed: [ACME],
            seen: [ACME, "/work"],
            owned: ["/other/node_modules/bpmnlint-plugin-gone", ACME],
            ids: [ACME, "/work", "/other/node_modules/bpmnlint-plugin-gone"],
        },
        {
            case: "no installed package linked to a folder outside every workspace folder",
            installed: ["/store/bpmnlint-plugin-linked"],
            seen: [],
            owned: [],
            ids: [],
        },
        {
            case: "no reported package or row outside every folder",
            installed: [],
            seen: ["/elsewhere/node_modules/a"],
            owned: ["/elsewhere/node_modules/b"],
            ids: [],
        },
    ])("lists $case", ({ installed, seen, owned, ids }) => {
        expect(rulePackageIdsToList(FOLDERS, { installed, seen, ownedRowIds: owned })).toEqual(ids);
    });
});

describe("isHashWanted", () => {
    const ID = "/work/node_modules/bpmnlint-plugin-acme";
    const none: HashContext = { inspected: new Set(), approvals: [], answers: new Map() };

    it.each<{ case: string; context: HashContext; wanted: boolean }>([
        { case: "not for a package nothing asks about", context: none, wanted: false },
        {
            case: "for a package the user asked to read",
            context: { ...none, inspected: new Set([ID]) },
            wanted: true,
        },
        {
            case: "for a package a stored row names",
            context: { ...none, approvals: [{ pluginId: ID, contentHash: "h" }] },
            wanted: true,
        },
        {
            case: "for a package declined this session",
            context: { ...none, answers: new Map([[`${ID}#h`, "declined"]]) },
            wanted: true,
        },
        {
            case: "for a package the user left to the view, so the view offers to allow it",
            context: { ...none, answers: new Map([[`${ID}#h`, "leftForView"]]) },
            wanted: true,
        },
        {
            case: "not for a package only another was asked about",
            context: {
                inspected: new Set(["/work/node_modules/other"]),
                approvals: [{ pluginId: "/work/node_modules/other", contentHash: "h" }],
                answers: new Map([["/work/node_modules/other#h", "leftForView"]]),
            },
            wanted: false,
        },
    ])("hashes $case", ({ context, wanted }) => {
        expect(isHashWanted(ID, context)).toBe(wanted);
    });
});

describe("leavesToView", () => {
    it.each<{ case: string; ids: string[]; folders: string[]; leaves: boolean }>([
        {
            case: "not with no folder open",
            ids: ["/work/.camunda/plugins/resize"],
            folders: [],
            leaves: false,
        },
        {
            case: "not with no folder open, even with nothing pending",
            ids: [],
            folders: [],
            leaves: false,
        },
        {
            case: "when every pending item lies inside a folder",
            ids: ["/work/.camunda/plugins/resize", "/other/node_modules/bpmnlint-plugin-acme"],
            folders: FOLDERS,
            leaves: true,
        },
        {
            case: "when an item lies in a folder nested in another",
            ids: ["/work/orders/.camunda/plugins/order-tools"],
            folders: ["/work", "/work/orders"],
            leaves: true,
        },
        {
            case: "not when a link put one item outside every folder",
            ids: ["/work/.camunda/plugins/resize", "/elsewhere/bpmnlint-plugin-linked"],
            folders: FOLDERS,
            leaves: false,
        },
        {
            case: "not for a folder that only starts like an open one",
            ids: ["/work2/.camunda/plugins/resize"],
            folders: ["/work"],
            leaves: false,
        },
    ])("leaves Review… to the view $case", ({ ids, folders, leaves }) => {
        expect(leavesToView(ids, folders)).toBe(leaves);
    });
});
