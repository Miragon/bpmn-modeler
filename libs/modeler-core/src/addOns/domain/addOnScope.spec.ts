import { describe, expect, it } from "vitest";

import {
    leavesToView,
    configAreaDirsToList,
    configFolderFilesGlob,
    configFolderHoldersIn,
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
                holderDirs: ["/work/.camunda/plugins", "/other/.camunda/plugins"],
                knownDirs,
            }),
        ).toEqual(dirs);
    });
});

describe("configFolderFilesGlob", () => {
    it.each([
        { configFolder: ".camunda", glob: "**/.camunda/**" },
        { configFolder: ".camunda/", glob: "**/.camunda/**" },
        { configFolder: ".camunda//", glob: "**/.camunda/**" },
        { configFolder: "config/camunda", glob: "**/config/camunda/**" },
    ])("lists every file of $configFolder at any depth", ({ configFolder, glob }) => {
        expect(configFolderFilesGlob(configFolder)).toBe(glob);
    });
});

describe("configFolderHoldersIn", () => {
    it.each<{
        case: string;
        files: string[];
        configFolder?: string;
        folders?: string[];
        holders: string[];
    }>([
        { case: "each workspace folder, with nothing found", files: [], holders: FOLDERS },
        {
            case: "a folder below a workspace folder whose config folder holds a file",
            files: ["/work/project-a/.camunda/plugins/local/plugin.json"],
            holders: [...FOLDERS, "/work/project-a"],
        },
        {
            case: "each holder once, however many files its config folder holds",
            files: [
                "/work/project-a/.camunda/plugins/local/plugin.json",
                "/work/project-a/.camunda/element-templates/mail.json",
                "/work/.camunda/plugins/global/plugin.json",
            ],
            holders: [...FOLDERS, "/work/project-a"],
        },
        {
            case: "a config folder setting with a trailing slash",
            files: ["/other/billing/.camunda/plugins/local/plugin.json"],
            configFolder: ".camunda/",
            holders: [...FOLDERS, "/other/billing"],
        },
        {
            case: "a config folder setting of two segments",
            files: ["/work/project-a/config/camunda/plugins/local/plugin.json"],
            configFolder: "config/camunda",
            holders: [...FOLDERS, "/work/project-a"],
        },
        {
            case: "no folder whose name only ends like the config folder",
            files: ["/work/project-a/my.camunda/plugins/local/plugin.json"],
            holders: FOLDERS,
        },
        {
            case: "no config folder inside an installed package or a build output",
            files: [
                "/work/node_modules/some-lib/.camunda/plugins/x/plugin.json",
                "/work/project-a/build/.camunda/element-templates/mail.json",
            ],
            holders: FOLDERS,
        },
        {
            case: "no config folder outside every workspace folder",
            files: ["/elsewhere/.camunda/plugins/x/plugin.json"],
            holders: FOLDERS,
        },
        {
            case: "no folder above a workspace folder that is a config folder itself",
            files: ["/work/.camunda/plugins/x/plugin.json"],
            folders: ["/work/.camunda"],
            holders: ["/work/.camunda"],
        },
    ])("finds $case", ({ files, configFolder = ".camunda", folders = FOLDERS, holders }) => {
        expect(configFolderHoldersIn(files, folders, configFolder)).toEqual(holders);
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

    it.each<{ case: string; installed: string[]; seen: string[]; ids: string[] }>([
        {
            case: "every source, each id once",
            installed: [ACME],
            seen: [ACME, "/work"],
            ids: [ACME, "/work"],
        },
        {
            case: "no installed package linked to a folder outside every workspace folder",
            installed: ["/store/bpmnlint-plugin-linked"],
            seen: [],
            ids: [],
        },
        {
            case: "no reported package outside every folder",
            installed: [],
            seen: ["/elsewhere/node_modules/a"],
            ids: [],
        },
    ])("lists $case", ({ installed, seen, ids }) => {
        expect(rulePackageIdsToList(FOLDERS, { installed, seen })).toEqual(ids);
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
