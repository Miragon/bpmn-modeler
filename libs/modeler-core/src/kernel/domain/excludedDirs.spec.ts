import { describe, expect, it } from "vitest";

import {
    EXCLUDED_DIRS,
    excludedDirsGlob,
    isInsideExcludedDirBelow,
    isInsideExcludedDirBelowEveryFolder,
} from "./excludedDirs";
import { globToRegExp } from "./globToRegExp";

describe("isInsideExcludedDirBelow", () => {
    it.each([
        {
            behaviour: "keeps a file of a workspace below a build directory",
            path: "/home/u/build/repo/a.bpmn",
            root: "/home/u/build/repo",
            excluded: false,
        },
        {
            behaviour: "excludes a file in a build directory below the root",
            path: "/home/u/build/repo/dist/a.bpmn",
            root: "/home/u/build/repo",
            excluded: true,
        },
        {
            behaviour: "excludes a file nested deep inside an excluded directory",
            path: "/home/u/build/repo/web/node_modules/pkg/a.bpmn",
            root: "/home/u/build/repo",
            excluded: true,
        },
        {
            behaviour: "keeps the root itself",
            path: "/home/u/build/repo",
            root: "/home/u/build/repo",
            excluded: false,
        },
        {
            behaviour: "keeps the files of a root named like build output",
            path: "/home/u/repo/target/a.bpmn",
            root: "/home/u/repo/target",
            excluded: false,
        },
        {
            behaviour: "ignores a trailing slash on the root",
            path: "/home/u/build/repo/a.bpmn",
            root: "/home/u/build/repo/",
            excluded: false,
        },
        {
            behaviour: "keeps a file whose name only starts with an excluded name",
            path: "/home/u/repo/build.gradle",
            root: "/home/u/repo",
            excluded: false,
        },
        {
            behaviour: "keeps a file of a workspace below a build directory on a drive",
            path: "C:/build/repo/a.bpmn",
            root: "C:/build/repo",
            excluded: false,
        },
        {
            behaviour: "keeps a file of a workspace on a share named like build output",
            path: "//server/out/repo/a.bpmn",
            root: "//server/out/repo",
            excluded: false,
        },
        {
            behaviour: "judges a path outside the root by all its segments",
            path: "/home/u/build/other/a.bpmn",
            root: "/home/u/build/repo",
            excluded: true,
        },
        {
            behaviour: "keeps a path outside the root without an excluded segment",
            path: "/home/u/other/a.bpmn",
            root: "/home/u/build/repo",
            excluded: false,
        },
    ])("$behaviour", ({ path, root, excluded }) => {
        expect(isInsideExcludedDirBelow(path, root)).toBe(excluded);
    });

    it.each(["node_modules", "dist", "build", "out", "target", "bin", "coverage", ".git"])(
        "excludes a file inside %s below the root",
        (directory) => {
            expect(isInsideExcludedDirBelow(`/repo/${directory}/a.bpmn`, "/repo")).toBe(true);
        },
    );
});

describe("isInsideExcludedDirBelowEveryFolder", () => {
    it.each([
        {
            behaviour: "keeps a file of a folder below a build directory beside another folder",
            path: "/home/u/build/repo/a.bpmn",
            folders: ["/home/u/web", "/home/u/build/repo"],
            excluded: false,
        },
        {
            behaviour: "excludes a file in a build directory below the folder that contains it",
            path: "/home/u/build/repo/dist/a.bpmn",
            folders: ["/home/u/web", "/home/u/build/repo"],
            excluded: true,
        },
        {
            behaviour: "keeps a file of a folder opened inside another folder's build output",
            path: "/x/proj/build/gen/a.bpmn",
            folders: ["/x/proj", "/x/proj/build/gen"],
            excluded: false,
        },
        {
            behaviour: "keeps that file whichever folder comes first",
            path: "/x/proj/build/gen/a.bpmn",
            folders: ["/x/proj/build/gen", "/x/proj"],
            excluded: false,
        },
        {
            behaviour: "excludes the outer folder's build output beside the nested folder",
            path: "/x/proj/build/a.bpmn",
            folders: ["/x/proj", "/x/proj/build/gen"],
            excluded: true,
        },
        {
            behaviour: "judges a path outside every folder by all its segments",
            path: "/elsewhere/dist/a.bpmn",
            folders: ["/home/u/web"],
            excluded: true,
        },
    ])("$behaviour", ({ path, folders, excluded }) => {
        expect(isInsideExcludedDirBelowEveryFolder(path, folders)).toBe(excluded);
    });
});

describe("excludedDirsGlob", () => {
    it.each([
        { path: "node_modules/pkg/a.bpmn", excluded: true },
        { path: "web/node_modules/pkg/a.bpmn", excluded: true },
        { path: "target/classes/a.bpmn", excluded: true },
        { path: "src/a.bpmn", excluded: false },
        { path: "builds/a.bpmn", excluded: false },
        { path: "src/my-build/a.bpmn", excluded: false },
        { path: "build.gradle", excluded: false },
    ])("leaves out $path: $excluded", ({ path, excluded }) => {
        expect(globToRegExp(excludedDirsGlob()).test(path)).toBe(excluded);
    });

    it.each([...EXCLUDED_DIRS])("leaves out the files inside %s at any depth", (directory) => {
        const excluded = globToRegExp(excludedDirsGlob());

        expect(excluded.test(`${directory}/a.bpmn`)).toBe(true);
        expect(excluded.test(`web/${directory}/pkg/a.bpmn`)).toBe(true);
    });

    it("leaves out a caller's own folders beside the excluded ones", () => {
        const excluded = globToRegExp(excludedDirsGlob("element-templates"));

        expect(excluded.test("config/element-templates/task.json")).toBe(true);
        expect(excluded.test("node_modules/pkg/package.json")).toBe(true);
        expect(excluded.test("payloads/vars.json")).toBe(false);
    });
});
