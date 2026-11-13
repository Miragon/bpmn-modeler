import { readWorkspaces, requireMatches, type SourceFile } from "@miragon/architecture-testing";
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { workspacesBuiltBy } from "./testing/rootScripts";
import { stagingFolders, viteStagingFolder } from "./testing/webviewStaging";
import {
    focusedWorkspaces,
    jobConditionTargets,
    triggerPaths,
    workflowPattern,
    yarnRunSteps,
} from "./testing/workflowText";

/**
 * Only the host builds decide which webviews ship; every other list of a
 * host's webviews must agree with them, or a webview fix misses a release line,
 * a publish job installs or builds the wrong set, or a test skips a change.
 * A publish job's focused install must also name only existing workspaces.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));

function readRepoFile(path: string): SourceFile {
    return { path, text: readFileSync(join(REPO_ROOT, path), "utf8") };
}

function readWorkflow(fileName: string): SourceFile {
    return readRepoFile(`.github/workflows/${fileName}`);
}

interface WebviewApp {
    readonly webview: string;
    readonly packageName: string;
    readonly stagingFolder: string;
}

const workspaces = readWorkspaces(REPO_ROOT);

// The staging folder decides, not the dir name, so a copy of a folder no app writes fails.
const webviewApps: WebviewApp[] = requireMatches(
    "apps whose Vite build writes dist/webview-staging",
    workspaces.flatMap(({ name, dir }) => {
        const viteConfigPath = `${dir}/vite.config.mts`;
        if (!dir.startsWith("apps/") || !existsSync(join(REPO_ROOT, viteConfigPath))) {
            return [];
        }
        const stagingFolder = viteStagingFolder(readRepoFile(viteConfigPath));
        return stagingFolder === undefined
            ? []
            : [{ webview: dir.slice("apps/".length), packageName: name, stagingFolder }];
    }),
);

const rootManifest = JSON.parse(readRepoFile("package.json").text) as {
    name: string;
    scripts: Record<string, string>;
};
const markerWorkflow = readWorkflow("sync-release-markers.yml");

function readHostBuild(name: string, buildFilePath: string) {
    const buildFile = readRepoFile(buildFilePath);
    const folders = stagingFolders(buildFile);
    return {
        name,
        buildFile: buildFile.path,
        unwrittenFolders: folders.filter(
            (folder) => !webviewApps.some((app) => app.stagingFolder === folder),
        ),
        shipped: webviewApps.filter((app) => folders.includes(app.stagingFolder)),
        notShipped: webviewApps.filter((app) => !folders.includes(app.stagingFolder)),
    };
}

const vsCode = {
    ...readHostBuild("VS Code", "apps/vscode-plugin/webpack.config.js"),
    markerVariable: "VSC_RELEVANT",
    publishWorkflows: ["publish-vscode-modeler.yml", "publish-open-vsx-modeler.yml"],
    // `yarn build` is also the repo-wide build, so it may build a webview another host ships.
    publishBuildsOnlyItsWebviews: false,
};
const intellij = {
    ...readHostBuild("IntelliJ", "apps/intellij-plugin/build.gradle.kts"),
    markerVariable: "IJ_RELEVANT",
    publishWorkflows: ["publish-intellij.yml"],
    publishBuildsOnlyItsWebviews: true,
};
const hosts = [vsCode, intellij];

type Host = (typeof hosts)[number];

function shippedCases(selectedHosts: readonly Host[]) {
    return requireMatches(
        "webviews a host ships",
        selectedHosts.flatMap((selectedHost) =>
            selectedHost.shipped.map((app) => ({
                ...app,
                selectedHost,
                host: selectedHost.name,
            })),
        ),
    );
}

function publishCases() {
    return shippedCases(hosts).flatMap((shipped) =>
        shipped.selectedHost.publishWorkflows.map((workflow) => ({ ...shipped, workflow })),
    );
}

function webviewNames(apps: readonly WebviewApp[]): string {
    return apps.map(({ webview }) => webview).join(", ");
}

function fixIn(webview: string): string {
    return `apps/${webview}/src/x.ts`;
}

function workspacesBuiltByWorkflow(workflow: SourceFile): string[] {
    return yarnRunSteps(workflow).flatMap((step) => workspacesBuiltBy(rootManifest.scripts, step));
}

describe("the webviews each host build packages", () => {
    it.each(hosts)("$name copies only staging folders a webview app writes", (host) => {
        expect(
            host.unwrittenFolders,
            `${host.name} copies ${host.unwrittenFolders.map((folder) => `dist/webview-staging/${folder}`).join(", ")} in ${host.buildFile}, which no apps/*/vite.config.mts outDir writes`,
        ).toEqual([]);
    });
});

describe("release markers for the webviews a host ships", () => {
    it.each(shippedCases(hosts))(
        "routes a fix in $webview to the $host release line",
        ({ webview, host, selectedHost }) => {
            expect(
                triggerPaths(markerWorkflow, "push"),
                `${host} ships ${webview}, but the push paths of ${markerWorkflow.path} lack apps/${webview}/**`,
            ).toContain(`apps/${webview}/**`);
            expect(
                workflowPattern(markerWorkflow, selectedHost.markerVariable).test(fixIn(webview)),
                `${host} ships ${webview}, but ${selectedHost.markerVariable} in ${markerWorkflow.path} does not match ${fixIn(webview)}`,
            ).toBe(true);
        },
    );

    it.each(hosts)("keeps a fix in a webview $name does not ship off its line", (host) => {
        const pattern = workflowPattern(markerWorkflow, host.markerVariable);
        const routed = host.notShipped
            .map(({ webview }) => webview)
            .filter((webview) => pattern.test(fixIn(webview)));

        expect(
            routed,
            `${host.name} ships no ${routed.join(", ")}, but ${host.markerVariable} in ${markerWorkflow.path} matches it`,
        ).toEqual([]);
    });

    it("triggers on no webview that no host ships", () => {
        const pushPaths = triggerPaths(markerWorkflow, "push");
        const unshipped = webviewApps
            .filter((app) => !hosts.some((host) => host.shipped.includes(app)))
            .map(({ webview }) => webview)
            .filter((webview) => pushPaths.includes(`apps/${webview}/**`));

        expect(
            unshipped,
            `no host ships ${unshipped.join(", ")}, but the push paths of ${markerWorkflow.path} name it`,
        ).toEqual([]);
    });
});

describe("publish workflows for the webviews a host ships", () => {
    it.each(publishCases())(
        "$workflow installs and builds $webview for $host",
        ({ webview, packageName, host, workflow }) => {
            const workflowFile = readWorkflow(workflow);

            expect(
                focusedWorkspaces(workflowFile),
                `${host} ships ${webview}, but the \`yarn workspaces focus\` line of ${workflowFile.path} lacks ${packageName}`,
            ).toContain(packageName);
            expect(
                workspacesBuiltByWorkflow(workflowFile),
                `${host} ships ${webview}, but no \`run: yarn …\` step of ${workflowFile.path} builds ${packageName}, following the scripts in package.json`,
            ).toContain(packageName);
        },
    );

    it.each(
        hosts
            .filter(({ publishBuildsOnlyItsWebviews }) => publishBuildsOnlyItsWebviews)
            .flatMap((host) => host.publishWorkflows.map((workflow) => ({ ...host, workflow }))),
    )("$workflow installs and builds no webview $name does not ship", (host) => {
        const workflowFile = readWorkflow(host.workflow);
        const focused = focusedWorkspaces(workflowFile);
        const built = workspacesBuiltByWorkflow(workflowFile);
        const focusedNotShipped = host.notShipped.filter(({ packageName }) =>
            focused.includes(packageName),
        );
        const builtNotShipped = host.notShipped.filter(({ packageName }) =>
            built.includes(packageName),
        );

        expect(
            focusedNotShipped,
            `${host.name} ships no ${webviewNames(focusedNotShipped)}, but the \`yarn workspaces focus\` line of ${workflowFile.path} names it`,
        ).toEqual([]);
        expect(
            builtNotShipped,
            `${host.name} ships no ${webviewNames(builtNotShipped)}, but a \`run: yarn …\` step of ${workflowFile.path} builds it`,
        ).toEqual([]);
    });
});

describe("the focused installs of the publish workflows", () => {
    // A focus argument that names no workspace fails only at release time.
    it.each(hosts.flatMap(({ publishWorkflows }) => publishWorkflows))(
        "%s focuses only existing workspaces",
        (workflow) => {
            const workspaceNames = new Set([
                rootManifest.name,
                ...workspaces.map(({ name }) => name),
            ]);
            const workflowFile = readWorkflow(workflow);
            const unknown = focusedWorkspaces(workflowFile).filter(
                (name) => !workspaceNames.has(name),
            );

            expect(
                unknown,
                `the \`yarn workspaces focus\` line of ${workflowFile.path} names ${unknown.join(", ")}, which is no workspace`,
            ).toEqual([]);
        },
    );
});

describe("the IntelliJ artefact refresh", () => {
    const refreshScript = "intellij:build";
    const built = workspacesBuiltBy(rootManifest.scripts, refreshScript);

    it.each(shippedCases([intellij]))("builds $webview", ({ webview, packageName }) => {
        expect(
            built,
            `IntelliJ ships ${webview}, but the root ${refreshScript} script in package.json does not build ${packageName}`,
        ).toContain(packageName);
    });

    it("builds no webview IntelliJ does not ship", () => {
        const builtNotShipped = intellij.notShipped.filter(({ packageName }) =>
            built.includes(packageName),
        );

        expect(
            builtNotShipped,
            `IntelliJ ships no ${webviewNames(builtNotShipped)}, but the root ${refreshScript} script in package.json builds it`,
        ).toEqual([]);
    });
});

describe("VS Code tests for the webviews it ships", () => {
    const smokeWorkflow = readWorkflow("vscode-smoke.yml");
    const buildWorkflow = readWorkflow("build.yml");
    const vitestTargets = JSON.parse(readRepoFile(".github/vitest-targets.json").text) as {
        targets: Record<string, { dir: string }>;
    };
    const e2eJob = "e2e-vscode-plugin";
    const e2eDirs = jobConditionTargets(buildWorkflow, e2eJob).map((target) => {
        const dir = vitestTargets.targets[target]?.dir;
        if (dir === undefined) {
            throw new Error(
                `${buildWorkflow.path} job ${e2eJob} names the unknown target ${target}`,
            );
        }
        return dir;
    });

    it.each(shippedCases([vsCode]))(
        "runs the smoke and e2e tests on a change to $webview",
        ({ webview }) => {
            expect(
                triggerPaths(smokeWorkflow, "pull_request"),
                `VS Code ships ${webview}, but the pull_request paths of ${smokeWorkflow.path} lack apps/${webview}/**`,
            ).toContain(`apps/${webview}/**`);
            expect(
                e2eDirs,
                `VS Code ships ${webview}, but the if of ${e2eJob} in ${buildWorkflow.path} names no target in apps/${webview}`,
            ).toContain(`apps/${webview}`);
        },
    );
});
