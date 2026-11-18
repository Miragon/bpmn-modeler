import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import {
    ATTRIBUTED_TYPES,
    releaseBranchOf,
    type ReleaseLineRegistry,
} from "../../../.github/scripts/release-routing.mjs";

/**
 * release-please releases each line from its folder release/<id>, which only
 * the attribution commits change. The registry, the release-please config, the
 * manifest and the versioned files must name the same lines and versions, or
 * a release tags the wrong version or publishes a file at the old one.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));

interface ExtraFile {
    type: "json" | "generic";
    path: string;
    jsonpath?: string;
}

/** The keys besides `component` and `include-component-in-tag` that change a tag. */
interface TagFormat {
    "tag-separator"?: string;
    "include-v-in-tag"?: boolean;
}

interface ReleasePackage extends TagFormat {
    "release-type": string;
    "component": string;
    "include-component-in-tag": boolean;
    "changelog-path": string;
    "exclude-paths"?: string[];
    "extra-files": ExtraFile[];
}

interface ReleasePleaseConfig extends TagFormat {
    "separate-pull-requests": boolean;
    "changelog-sections": { type: string; section: string; hidden?: boolean }[];
    "packages": Record<string, ReleasePackage>;
}

function readRepoText(path: string): string {
    return readFileSync(join(REPO_ROOT, path), "utf8");
}

function readRepoJson<T>(path: string): T {
    return JSON.parse(readRepoText(path)) as T;
}

/** release-please resolves a leading `/` to the repository root. */
function repoPath(releasePleasePath: string): string {
    return releasePleasePath.replace(/^\//, "");
}

const registry = readRepoJson<ReleaseLineRegistry>(".github/release-lines.json");
const config = readRepoJson<ReleasePleaseConfig>("release-please-config.json");
const manifest = readRepoJson<Record<string, string>>(".release-please-manifest.json");
const componentPaths = registry.lines.map(({ componentPath }) => componentPath);
const lines = registry.lines.map(({ id, componentPath }) => ({
    id,
    componentPath,
    releasePackage: config.packages[componentPath],
    version: readRepoText(`${componentPath}/version.txt`).trim(),
}));

function versionIn(file: ExtraFile): string | undefined {
    const text = readRepoText(repoPath(file.path));
    if (file.type === "json") {
        expect(file.jsonpath).toBe("$.version");
        return (JSON.parse(text) as { version?: string }).version;
    }
    return /x-release-please-start-version\n[^=\n]+=(\S+)\n[^]*?x-release-please-end/.exec(
        text,
    )?.[1];
}

describe("the release-please packages", () => {
    it("are the registry's release lines, in its order", () => {
        expect(Object.keys(config.packages)).toEqual(componentPaths);
        expect(Object.keys(manifest)).toEqual(componentPaths);
    });

    it.each(lines)(
        "release $id from $componentPath as a simple package tagged by its id",
        ({ id, releasePackage }) => {
            expect(releasePackage["release-type"]).toBe("simple");
            expect(releasePackage.component).toBe(id);
            expect(releasePackage["include-component-in-tag"]).toBe(true);
            expect(releasePackage["exclude-paths"]).toBeUndefined();
        },
    );

    it("are tagged <component>-v<version>, the tag the sync's reconcile and audit read", () => {
        for (const tagFormat of [config, ...Object.values(config.packages)]) {
            expect(tagFormat["tag-separator"]).toBeUndefined();
            expect(tagFormat["include-v-in-tag"]).toBeUndefined();
        }
    });

    it("list in their changelogs only the types an attribution commit carries", () => {
        const shownTypes = config["changelog-sections"]
            .filter(({ hidden }) => hidden !== true)
            .map(({ type }) => type);

        expect(shownTypes).toEqual([...ATTRIBUTED_TYPES]);
    });

    it.each(lines)("keep the changelog of $id at a repository path", ({ releasePackage }) => {
        const changelog = releasePackage["changelog-path"];

        expect(changelog).toMatch(/^\/.+\/CHANGELOG\.md$/);
        expect(existsSync(join(REPO_ROOT, repoPath(changelog)))).toBe(true);
    });

    it.each(lines)(
        "version $id in version.txt at the manifest's version",
        ({ componentPath, version }) => {
            expect(version).toBe(manifest[componentPath]);
        },
    );

    it.each(lines)("record the last attribution of $id", ({ componentPath }) => {
        expect(readRepoText(`${componentPath}/ATTRIBUTION`)).toMatch(
            /^bundledCommit=[0-9a-f]{40}$/m,
        );
    });
});

describe.each(lines)("the files that carry the $id version", ({ releasePackage, version }) => {
    it.each(releasePackage["extra-files"])("$path is at version.txt's version", (file) => {
        expect(file.path, "a path without a leading / is read inside release/<id>").toMatch(/^\//);
        expect(versionIn(file)).toBe(version);
    });
});

describe("the versions release-please bumps", () => {
    const extraFilesOf = (id: string) =>
        config.packages[`release/${id}`]["extra-files"].map(({ path }) => path);

    it("keeps the private root package.json at the npm package's version", () => {
        expect(extraFilesOf("bpmn-modeler")).toContain("/package.json");
    });

    it("bumps the Orca plugin's manifest with its workspace", () => {
        expect(extraFilesOf("orca")).toEqual(
            expect.arrayContaining([
                "/apps/orca-plugin/package.json",
                "/apps/orca-plugin/orca-plugin.json",
            ]),
        );
    });

    it("bumps the standalone app with the VS Code extension, which it ships", () => {
        expect(extraFilesOf("vscode")).toEqual(
            expect.arrayContaining([
                "/apps/vscode-plugin/package.json",
                "/apps/standalone/package.json",
                "/libs/standalone-extension/package.json",
            ]),
        );
    });
});

describe("the workflows around the release lines", () => {
    it("publish from the outputs of packages that exist", () => {
        const outputPaths = [
            ...readRepoText(".github/workflows/release-please.yml").matchAll(
                /steps\.release\.outputs\['([^']+)--[a-z_]+'\]/g,
            ),
        ].map(([, path]) => path);

        expect(new Set(outputPaths)).toEqual(new Set(componentPaths));
    });

    it("check the release PR under the branch name release-please gives it", () => {
        const releaseBranch = releaseBranchOf("main");
        const workflows = ["release-attribution.yml", "sync-release-lines.yml"].map((name) =>
            readRepoText(`.github/workflows/${name}`),
        );

        expect(config["separate-pull-requests"]).toBe(false);
        for (const workflow of workflows) {
            expect(workflow.match(/release-please--branches--\S*/g)).toEqual([releaseBranch]);
            expect(workflow).toContain(`RELEASE_BRANCH: ${releaseBranch}\n`);
        }
    });

    it("skip the attribution check only on a PR that is not the release PR", () => {
        const conditions = [
            ...readRepoText(".github/workflows/release-attribution.yml").matchAll(
                /^\s+(?:- )?if: (.+)$/gm,
            ),
        ].map(([, condition]) => condition);

        expect(conditions.length).toBeGreaterThan(0);
        for (const condition of conditions) {
            expect(condition).toMatch(/^github\.head_ref [!=]= env\.RELEASE_BRANCH$/);
        }
    });

    it("keep the sync from triggering on its own attribution commits", () => {
        expect(readRepoText(".github/workflows/sync-release-lines.yml")).toMatch(
            /paths-ignore:\n\s+- 'release\/\*\*'/,
        );
    });

    it("leave no marker file of the routing by bundled paths", () => {
        const markers = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" })
            .split("\n")
            .filter((path) => /(?:^|\/)BUNDLED_(?:WEBVIEW|LIBS)$/.test(path));

        expect(markers).toEqual([]);
    });
});
