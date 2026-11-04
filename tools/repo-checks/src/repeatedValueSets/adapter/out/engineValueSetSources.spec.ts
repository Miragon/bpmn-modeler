import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import { EngineValueSetSources } from "./engineValueSetSources";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
    const files: Record<string, string> = {
        "a/domain/auth.ts": '// The auth types.\nexport const TYPES = ["none", "basic", "oauth2"];',
        "b/service/check.mjs": [
            "export function isAuth(type) {",
            '    return type === "none" || type === "basic";',
            "}",
        ].join("\n"),
        "a/domain/auth.spec.ts": 'const cases = ["none", "basic", "oauth2"];',
        "a/types/moddle.d.ts": 'type Kind = "none" | "basic";',
        "a/vite.config.ts": 'export default { formats: ["es", "cjs"] };',
        "a/package.json": JSON.stringify({ files: ["dist", "src"] }),
        "a/deleted.ts": 'const gone = ["x", "y"];',
    };
    for (const [path, content] of Object.entries(files)) {
        repository.write(path, content);
    }
    repository.git("add", "--all");
    repository.git("commit", "--quiet", "-m", "fixture");
    repository.write("a/untracked.ts", 'const scratch = ["none", "basic"];');
    rmSync(join(repository.root, "a/deleted.ts"));
});

afterEach(() => {
    repository.remove();
});

describe("the engine value set sources", () => {
    it("read the sets of the tracked script files with repo-relative paths and lines", () => {
        expect(new EngineValueSetSources().read(repository.root)).toEqual([
            { path: "a/domain/auth.ts", line: 2, values: ["none", "basic", "oauth2"] },
            { path: "b/service/check.mjs", line: 2, values: ["none", "basic"] },
        ]);
    });
});
