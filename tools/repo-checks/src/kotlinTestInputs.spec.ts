import { readFileSync } from "node:fs";
import { join, normalize, posix } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = normalize(join(__dirname, "../../.."));
const GRADLE_PROJECT = "apps/intellij-plugin";

function readRepoFile(path: string): string {
    return readFileSync(join(REPO_ROOT, path), "utf8");
}

function kotlinTestInputs(): string[] {
    const buildScript = readRepoFile(`${GRADLE_PROJECT}/build.gradle.kts`);
    const declaredFiles = new Map(
        [
            ...buildScript.matchAll(/^val (\w+) =\s*layout\.projectDirectory\.file\("([^"]+)"\)/gm),
        ].map(([, variable, path]) => [variable, posix.join(GRADLE_PROJECT, path)]),
    );
    const testInputs = /^tasks\.test \{[\s\S]*?mapOf\(([\s\S]*?)\)\.forEach/m.exec(buildScript);
    if (!testInputs) {
        throw new Error("build.gradle.kts passes no file to tasks.test through mapOf(...).forEach");
    }
    return [...testInputs[1].matchAll(/"\w+" to (\w+)/g)].map(([, variable]) => {
        const path = declaredFiles.get(variable);
        if (!path) {
            throw new Error(
                `build.gradle.kts declares no layout.projectDirectory.file ${variable}`,
            );
        }
        return path;
    });
}

function intellijPluginFilter(): string[] {
    const workflow = readRepoFile(".github/workflows/build.yml");
    const block = /^( +)intellij-plugin:\n((?:\1 +(?:- '[^']+'|#.*)\n)+)/m.exec(workflow);
    if (!block) {
        throw new Error("build.yml has no intellij-plugin paths filter");
    }
    return [...block[2].matchAll(/- '([^']+)'/g)].map(([, pattern]) => pattern);
}

const matchesFilter = (path: string, pattern: string): boolean =>
    pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : path === pattern;

const inputs = kotlinTestInputs();
const filter = intellijPluginFilter();

// The Kotlin job runs only when the `intellij-plugin` filter matches, so a
// TypeScript-side file a Kotlin test reads, changed on its own, skips that test
// unless the filter lists the file.
describe("files the Kotlin tests read", () => {
    it("reads the test inputs and the filter", () => {
        expect(inputs).toContain("apps/modeler-bridge/src/protocol/domain/protocol.json");
        expect(filter).toContain(`${GRADLE_PROJECT}/**`);
    });

    it("runs the Kotlin job when one of them changes on its own", () => {
        const unfiltered = inputs.filter(
            (path) => !filter.some((pattern) => matchesFilter(path, pattern)),
        );

        expect(unfiltered).toEqual([]);
    });
});
