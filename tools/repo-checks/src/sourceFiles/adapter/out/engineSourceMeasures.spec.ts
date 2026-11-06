import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import { EngineSourceMeasures } from "./engineSourceMeasures";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
});

afterEach(() => {
    repository.remove();
});

describe("the engine's source measures", () => {
    it("measures every tracked TypeScript file of a workspace, by path", () => {
        const files: Record<string, string> = {
            "package.json": JSON.stringify({ name: "root", workspaces: ["libs/*"] }),
            "libs/core/src/b.ts": "// why\nexport function f(a) {\n    return a ?? 1;\n}\n",
            "libs/core/src/a.ts": "export const a = 1;\n",
            "libs/core/src/a.spec.ts": "it('x', () => {});",
            "scripts/outside.ts": "export const b = 2;",
        };
        for (const [path, content] of Object.entries(files)) {
            repository.write(path, content);
        }
        repository.git("add", "--all");
        repository.write("libs/core/src/untracked.ts", "export const c = 3;");

        expect(new EngineSourceMeasures().read(repository.root)).toEqual([
            { path: "libs/core/src/a.ts", codeLines: 1, functions: [], barrel: false },
            {
                path: "libs/core/src/b.ts",
                codeLines: 3,
                functions: [{ name: "f", line: 2, complexity: 2 }],
                barrel: false,
            },
        ]);
    });

    it("tells a barrel, which only imports and re-exports, from a file of type declarations", () => {
        const files: Record<string, string> = {
            "package.json": JSON.stringify({ name: "root", workspaces: ["libs/*"] }),
            "libs/core/src/index.ts":
                'import { b } from "./b";\nexport * from "./a";\nexport type { Message } from "./types";\nexport { b };\n',
            "libs/core/src/types.ts": 'export interface Message {\n    kind: "save";\n}\n',
        };
        for (const [path, content] of Object.entries(files)) {
            repository.write(path, content);
        }
        repository.git("add", "--all");

        expect(
            new EngineSourceMeasures()
                .read(repository.root)
                .map(({ path, barrel }) => [path, barrel]),
        ).toEqual([
            ["libs/core/src/index.ts", true],
            ["libs/core/src/types.ts", false],
        ]);
    });
});
