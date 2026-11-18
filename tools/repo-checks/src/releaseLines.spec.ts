import { readWorkspaces, type SourceFile } from "@miragon/architecture-testing";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { globToRegExp, matchesGlobs } from "../../../.github/scripts/glob.mjs";
import {
    derivedLines,
    type ReleaseLine,
    type ReleaseLineRegistry,
} from "../../../.github/scripts/release-routing.mjs";
import { hostBuildOf, webviewAppsOf } from "./testing/hostBuilds";
import { bpmnInlinedLibraries, dmnInlinedLibraries } from "./testing/inlinedLibraries";

/**
 * The release line registry must follow the builds: a line ships exactly the
 * workspaces its build bundles, or a change misses the notes of the users who
 * get it, or lands in the notes of users who do not.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const REGISTRY_PATH = ".github/release-lines.json";

function readRepoFile(path: string): SourceFile {
    return { path, text: readFileSync(join(REPO_ROOT, path), "utf8") };
}

interface Manifest {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
}

const registry = JSON.parse(readRepoFile(REGISTRY_PATH).text) as ReleaseLineRegistry;
const workspaces = readWorkspaces(REPO_ROOT);
const workspaceDirs = workspaces.map(({ dir }) => dir);
const dirByName = new Map(workspaces.map(({ name, dir }) => [name, dir]));
const manifestByDir = new Map(
    workspaceDirs.map((dir) => [
        dir,
        JSON.parse(readRepoFile(`${dir}/package.json`).text) as Manifest,
    ]),
);
const webviewApps = webviewAppsOf(workspaces, (dir) =>
    existsSync(join(REPO_ROOT, dir, "vite.config.mts"))
        ? readRepoFile(`${dir}/vite.config.mts`)
        : undefined,
);

function webviewDirsBuiltBy(host: string, buildFilePath: string): string[] {
    return hostBuildOf(host, readRepoFile(buildFilePath), webviewApps).shipped.map(
        ({ dir }) => dir,
    );
}

const vsCodeWebviews = webviewDirsBuiltBy("VS Code", "apps/vscode-plugin/webpack.config.js");
const intellijWebviews = webviewDirsBuiltBy("IntelliJ", "apps/intellij-plugin/build.gradle.kts");

/** Where each line's build starts; its own folder is the one a breaking change must touch. */
const lineBuilds = [
    {
        id: "bpmn-modeler",
        ownFolder: "packages/bpmn-modeler",
        roots: ["packages/bpmn-modeler"],
    },
    {
        id: "vscode",
        ownFolder: "apps/vscode-plugin",
        // The standalone app is versioned and released with the extension.
        roots: ["apps/vscode-plugin", "apps/standalone", ...vsCodeWebviews],
    },
    {
        id: "intellij",
        ownFolder: "apps/intellij-plugin",
        // The plugin itself is a Gradle project, no workspace; it ships the bridge binary.
        roots: ["apps/modeler-bridge", ...intellijWebviews],
    },
    { id: "orca", ownFolder: "apps/orca-plugin", roots: ["apps/orca-plugin"] },
    { id: "dmn-modeler", ownFolder: "packages/dmn-modeler", roots: ["packages/dmn-modeler"] },
];

/** A source file any workspace could hold: a glob that ships the workspace matches it. */
function sourceFileIn(dir: string): string {
    return `${dir}/src/index.ts`;
}

function lineOf(id: string): ReleaseLine {
    const line = registry.lines.find((candidate) => candidate.id === id);
    if (!line) throw new Error(`${REGISTRY_PATH} has no line ${id}`);
    return line;
}

function shipsWorkspace(line: ReleaseLine, dir: string): boolean {
    return derivedLines([sourceFileIn(dir)], { ...registry, lines: [line] }).length > 0;
}

function isUnreleased(dir: string): boolean {
    return registry.unreleased.some((glob) => globToRegExp(glob).test(dir));
}

function workspaceDependencies(
    dir: string,
    kinds: readonly (keyof Manifest)[] = ["dependencies", "devDependencies", "peerDependencies"],
): string[] {
    const manifest = manifestByDir.get(dir) ?? {};
    return kinds.flatMap((kind) =>
        Object.entries(manifest[kind] ?? {})
            .filter(([, version]) => version.startsWith("workspace:"))
            .map(([name]) => {
                const dependency = dirByName.get(name);
                if (!dependency) throw new Error(`${dir}/package.json names no workspace ${name}`);
                return dependency;
            }),
    );
}

/**
 * The workspaces a build of `roots` bundles: their workspace dependencies,
 * recursively. A package inlines its libraries as devDependencies, so those
 * count; the unreleased test tooling does not.
 */
function bundledWorkspaces(roots: readonly string[]): string[] {
    const bundled = new Set<string>();
    const visit = (dir: string): void => {
        if (bundled.has(dir) || isUnreleased(dir)) return;
        bundled.add(dir);
        workspaceDependencies(dir).forEach(visit);
    };
    roots.forEach(visit);
    return [...bundled].sort();
}

function shippedWorkspaces(line: ReleaseLine): string[] {
    return workspaceDirs.filter((dir) => shipsWorkspace(line, dir)).sort();
}

describe("the release line registry", () => {
    it("lists the lines the builds below describe, each with its release folder", () => {
        expect(registry.lines.map(({ id }) => id)).toEqual(lineBuilds.map(({ id }) => id));
        for (const { id, componentPath } of registry.lines) {
            expect(componentPath).toBe(`release/${id}`);
        }
    });

    it("ships every workspace on a line or lists it as unreleased", () => {
        const unrouted = workspaceDirs.filter(
            (dir) =>
                !isUnreleased(dir) && !registry.lines.some((line) => shipsWorkspace(line, dir)),
        );

        expect(
            unrouted,
            `no line in ${REGISTRY_PATH} ships ${unrouted.join(", ")}; add it to the ships of each line whose build bundles it, or to "unreleased"`,
        ).toEqual([]);
    });

    it("ships no workspace it lists as unreleased", () => {
        const both = workspaceDirs.filter(
            (dir) => isUnreleased(dir) && registry.lines.some((line) => shipsWorkspace(line, dir)),
        );

        expect(both).toEqual([]);
    });

    it("lists only workspaces as unreleased", () => {
        expect(
            registry.unreleased.filter(
                (glob) => !workspaceDirs.some((dir) => globToRegExp(glob).test(dir)),
            ),
        ).toEqual([]);
    });

    it("names only paths that exist", () => {
        const globs = [...registry.ignore, ...registry.lines.flatMap(({ ships }) => ships)];
        const missing = globs
            .map((glob) => glob.replace(/^!/, "").replace(/\/\*\*$/, ""))
            .filter((path) => !path.includes("*") && !existsSync(join(REPO_ROOT, path)));

        expect(missing, `${REGISTRY_PATH} names paths that do not exist`).toEqual([]);
    });

    it("keeps test tooling out of the runtime dependencies of a shipped workspace", () => {
        const runtimeTooling = workspaceDirs
            .filter((dir) => !isUnreleased(dir))
            .flatMap((dir) =>
                workspaceDependencies(dir, ["dependencies", "peerDependencies"])
                    .filter(isUnreleased)
                    .map((dependency) => `${dir} -> ${dependency}`),
            );

        expect(runtimeTooling).toEqual([]);
    });
});

describe.each(lineBuilds)("the $id release line", ({ id, ownFolder, roots }) => {
    const line = lineOf(id);

    it("ships its own folder", () => {
        expect(matchesGlobs(line.ships, sourceFileIn(ownFolder))).toBe(true);
    });

    it("ships every workspace its build bundles", () => {
        const shipped = shippedWorkspaces(line);
        const missing = bundledWorkspaces(roots).filter((dir) => !shipped.includes(dir));

        expect(
            missing,
            `${roots.join(", ")} bundle ${missing.join(", ")} through their workspace dependencies, but the ships of ${id} in ${REGISTRY_PATH} lack it`,
        ).toEqual([]);
    });

    it("ships no workspace its build does not bundle", () => {
        const bundled = bundledWorkspaces(roots);
        const extra = shippedWorkspaces(line).filter((dir) => !bundled.includes(dir));

        expect(
            extra,
            `the ships of ${id} in ${REGISTRY_PATH} name ${extra.join(", ")}, which no workspace dependency of ${roots.join(", ")} reaches`,
        ).toEqual([]);
    });

    it("ships the modeler bundle preset when a build it bundles spreads it", () => {
        const spreadsPreset = shippedWorkspaces(line).some((dir) =>
            readdirSync(join(REPO_ROOT, dir))
                .filter((name) => /^vite.*\.mts$/.test(name))
                .some((name) => readRepoFile(`${dir}/${name}`).text.includes("../../vite.shared")),
        );

        expect(derivedLines(["vite.shared.ts"], registry).includes(id)).toBe(spreadsPreset);
    });

    if (id === "bpmn-modeler") {
        it("keeps a breaking mark for every file it ships: its contract spans the inlined libraries", () => {
            expect(line.breaking).toEqual(["**"]);
        });
    } else {
        it("keeps a breaking mark only for its own folder", () => {
            expect(line.breaking).toEqual([`${ownFolder}/**`]);
        });
    }
});

describe("the libraries the npm packages inline", () => {
    const bpmnInlined = bpmnInlinedLibraries(
        readRepoFile("packages/bpmn-modeler/inlined-libraries.json").text,
    );
    const dmnInlined = dmnInlinedLibraries(
        readRepoFile("packages/dmn-modeler/vite.config.mts").text,
    );

    it.each(bpmnInlined)("ships libs/%s on the bpmn-modeler line", (library) => {
        expect(derivedLines([sourceFileIn(`libs/${library}`)], registry)).toContain("bpmn-modeler");
    });

    it.each(dmnInlined)("ships libs/%s on the dmn-modeler line", (library) => {
        expect(derivedLines([sourceFileIn(`libs/${library}`)], registry)).toContain("dmn-modeler");
    });
});

describe("the merge vocabulary", () => {
    it("ships only on the lines that ship the merge library, which alone reads it", () => {
        expect(derivedLines(["libs/modeler-types/src/mergeVocabulary.ts"], registry)).toEqual(
            derivedLines([sourceFileIn("libs/bpmn-merge")], registry),
        );
    });
});
