import { readWorkspaces, type SourceFile } from "@miragon/architecture-testing";
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { webviewAppsOf } from "./testing/hostBuilds";

/**
 * Every webview a host embeds takes its build guards from the root list, so a
 * guard wired into one webview cannot be missed in its sibling.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));

function readRepoFile(path: string): SourceFile {
    return { path, text: readFileSync(join(REPO_ROOT, path), "utf8") };
}

const webviewConfigs = webviewAppsOf(readWorkspaces(REPO_ROOT), (dir) =>
    existsSync(join(REPO_ROOT, dir, "vite.config.mts"))
        ? readRepoFile(`${dir}/vite.config.mts`)
        : undefined,
).map(({ dir }) => readRepoFile(`${dir}/vite.config.mts`));

describe("the webview build guards", () => {
    it.each(webviewConfigs.map((config) => [config.path, config]))(
        "are spread into the plugins of %s",
        (_path, config) => {
            expect(config.text).toMatch(/\.\.\.webviewBuildGuards\(\{ entry: "[^"]+" \}\)/);
        },
    );

    it.each(webviewConfigs.map((config) => [config.path, config]))(
        "are not wired one by one in %s",
        (_path, config) => {
            expect(config.text).not.toMatch(
                /\b(?:webviewImportBudget|noFixturesInProductionBundle)\(/,
            );
        },
    );
});
