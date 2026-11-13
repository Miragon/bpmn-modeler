import { describe, expect, it } from "vitest";

import {
    readPathCandidates,
    uncoveredReads,
    withoutQuery,
} from "../../../.github/scripts/vitest-target-reads.mjs";

const SPEC = "packages/dmn-modeler/src/styles/diffPalette.spec.ts";
const REPO_CHECKS_SPEC = "tools/repo-checks/src/kotlinTestInputs.spec.ts";

describe("the paths a spec reads", () => {
    it.each([
        {
            anchor: "__dirname with join",
            source: `import { join } from "node:path";
                readFileSync(join(__dirname, "../../../bpmn-modeler/src/styles/diffView.css"));`,
            reads: ["packages/bpmn-modeler/src/styles/diffView.css"],
        },
        {
            anchor: "__dirname with resolve",
            source: `import { resolve } from "path";
                readFileSync(resolve(__dirname, "../../../../release-please-config.json"));`,
            reads: ["release-please-config.json"],
        },
        {
            anchor: "__filename with dirname and normalize",
            source: `import { dirname, join, normalize } from "node:path";
                readFileSync(normalize(join(dirname(__filename), "../../../../docs/a.md")));`,
            reads: ["docs/a.md"],
        },
        {
            anchor: "import.meta.dirname",
            source: `import { join } from "node:path";
                readFileSync(join(import.meta.dirname, "../../../shared/x.json"));`,
            reads: ["packages/shared/x.json"],
        },
        {
            anchor: "import.meta.filename",
            source: `import { dirname, join } from "node:path";
                readFileSync(join(dirname(import.meta.filename), "../../../shared/x.json"));`,
            reads: ["packages/shared/x.json"],
        },
        {
            anchor: "import.meta.url through fileURLToPath",
            source: `import { dirname, join } from "node:path";
                import { fileURLToPath } from "node:url";
                const here = dirname(fileURLToPath(import.meta.url));
                readFileSync(join(here, "../../../../.miragon/brand-assets.sha256"));`,
            reads: [".miragon/brand-assets.sha256"],
        },
        {
            anchor: "new URL relative to import.meta.url",
            source: `import { fileURLToPath } from "node:url";
                readFileSync(fileURLToPath(new URL("../../../../docs/b.md", import.meta.url)));`,
            reads: ["docs/b.md"],
        },
        {
            anchor: "the path module's namespace",
            source: `import path from "node:path";
                readFileSync(path.join(__dirname, "../../../bpmn-modeler/a.css"));`,
            reads: ["packages/bpmn-modeler/a.css"],
        },
        {
            anchor: "string concatenation",
            source: `readFileSync(__dirname + "/../../../bpmn-modeler/a.css");`,
            reads: ["packages/bpmn-modeler/a.css"],
        },
    ])("resolves a path anchored at $anchor", ({ source, reads }) => {
        expect(readPathCandidates(source, SPEC)).toEqual(expect.arrayContaining(reads));
    });

    it("follows const bindings and evaluates template literals of them", () => {
        const source = `import { join } from "node:path";
            const STYLES = join(__dirname, "../../../bpmn-modeler/src/styles");
            const NAME = "diffView";
            readFileSync(\`\${STYLES}/\${NAME}.css\`);`;

        expect(readPathCandidates(source, SPEC)).toEqual([
            "packages/bpmn-modeler/src/styles",
            "packages/bpmn-modeler/src/styles/diffView.css",
        ]);
    });

    it("takes each string of a file that binds the repo root as a repo-relative candidate", () => {
        const source = `import { join, normalize } from "node:path";
            import { describe } from "vitest";
            const REPO_ROOT = normalize(join(__dirname, "../../.."));
            const GRADLE_PROJECT = "apps/intellij-plugin";
            const readRepoFile = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
            readRepoFile(\`\${GRADLE_PROJECT}/build.gradle.kts\`);
            readRepoFile("./.github/workflows/build.yml");
            readRepoFile("libs/a.css?raw");`;

        expect(readPathCandidates(source, REPO_CHECKS_SPEC)).toEqual([
            ".github/workflows/build.yml",
            "apps/intellij-plugin",
            "apps/intellij-plugin/build.gradle.kts",
            "libs/a.css",
            "utf8",
        ]);
    });

    it("reads no plain string of a file that does not bind the repo root", () => {
        const source = `import { join } from "node:path";
            const local = join(__dirname, "fixture.bpmn");
            expect(path).toBe("libs/shared/src/a.ts");`;

        expect(readPathCandidates(source, SPEC)).toEqual([
            "packages/dmn-modeler/src/styles/fixture.bpmn",
        ]);
    });

    it.each([
        {
            case: "a path built from a parameter",
            source: `import { join } from "node:path";
                const read = (name) => readFileSync(join(__dirname, "../../../x", name));`,
            reads: [],
        },
        {
            case: "a path relative to the working directory",
            source: `import { resolve } from "node:path";
                readFileSync(resolve("../../docs/a.md"));`,
            reads: [],
        },
        {
            case: "a path outside the repository",
            source: `import { join } from "node:path";
                readFileSync(join(__dirname, "../../../../../outside.txt"));`,
            reads: [],
        },
        {
            case: "the repository root itself",
            source: `import { join } from "node:path";
                const REPO_ROOT = join(__dirname, "../../../..");`,
            reads: [],
        },
        {
            case: "an array's join",
            source: `const joined = [__dirname, "../../../docs"].join("/");`,
            reads: [],
        },
        {
            case: "a join not imported from the path module",
            source: `import { join } from "./strings";
                const joined = join(__dirname, "../../../docs");`,
            reads: [],
        },
    ])("resolves nothing for $case", ({ source, reads }) => {
        expect(readPathCandidates(source, SPEC)).toEqual(reads);
    });

    it("keeps the directory a path is joined onto when the rest is computed", () => {
        const source = `import { join } from "node:path";
            const SKILLS_DIR = join(__dirname, "../../../../../.agents/skills");
            const read = (skill) => readFileSync(join(SKILLS_DIR, skill, "SKILL.md"));`;

        expect(
            readPathCandidates(source, "tools/repo-checks/src/fitness/composition/a.spec.ts"),
        ).toEqual([".agents/skills"]);
    });
});

describe("the reads a target's trigger paths miss", () => {
    const repoFiles = [
        "libs/shared/src/messages.ts",
        "libs/shared/vitest.config.ts",
        "packages/bpmn-modeler/src/styles/diffView.css",
        "packages/dmn-modeler/src/styles/diff.css",
        ".agents/skills/tdd/SKILL.md",
    ];
    const target = {
        targetDir: "packages/dmn-modeler",
        repoFiles,
        isTriggered: (path: string) => path.startsWith("libs/shared/src/"),
    };

    it.each([
        { read: "packages/bpmn-modeler/src/styles/diffView.css", kind: "file" },
        { read: ".agents/skills", kind: "directory" },
    ])("reports the $kind $read when no trigger covers it", ({ read, kind }) => {
        expect(uncoveredReads([read], target)).toEqual([{ path: read, kind }]);
    });

    it.each([
        { case: "a file a trigger covers", read: "libs/shared/src/messages.ts" },
        { case: "a directory with one covered file under it", read: "libs" },
        { case: "a path inside the target's own workspace", read: "packages/dmn-modeler/src" },
        { case: "a path that does not exist", read: "libs/missing.ts" },
        { case: "a name that only prefixes an existing path", read: "libs/sha" },
    ])("accepts $case", ({ read }) => {
        expect(uncoveredReads([read], target)).toEqual([]);
    });
});

describe("an import specifier", () => {
    it.each([
        {
            specifier: "../../bpmn-modeler/src/styles/diffView.css?raw",
            path: "../../bpmn-modeler/src/styles/diffView.css",
        },
        { specifier: "./a.svg?url#icon", path: "./a.svg" },
        { specifier: "./a", path: "./a" },
    ])("names $path without its query", ({ specifier, path }) => {
        expect(withoutQuery(specifier)).toBe(path);
    });
});
