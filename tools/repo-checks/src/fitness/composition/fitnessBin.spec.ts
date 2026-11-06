import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TempGitRepository } from "../__fixtures__/tempGitRepository";

const BIN = join(__dirname, "../../../bin/fitness.mjs");

// Vite marks `runnerImport` experimental; this catches a Vite bump that breaks the runner.
describe("the fitness bin", () => {
    it("loads the TypeScript entry with its workspace aliases", () => {
        const { status, stderr } = spawnSync(process.execPath, [BIN, "no-such-command"], {
            encoding: "utf8",
        });

        expect(stderr).toContain("fitness: unknown command no-such-command");
        expect(status).toBe(2);
    });

    it("measures the checkout --repo names", () => {
        const repository = new TempGitRepository();

        try {
            const head = repository.commit("a.ts", "export const a = 1;\n");
            repository.git("update-ref", "refs/remotes/origin/main", head);

            const { status, stdout } = spawnSync(
                process.execPath,
                [BIN, "--repo", repository.root, "--format", "json"],
                { encoding: "utf8" },
            );

            expect(status).toBe(0);
            expect(JSON.parse(stdout).head.commit).toBe(head);
        } finally {
            repository.remove();
        }
    });

    it("exits 1 on a --repo folder that is no git checkout", () => {
        const folder = mkdtempSync(join(tmpdir(), "fitness-spec-plain-"));

        try {
            const { status, stdout, stderr } = spawnSync(
                process.execPath,
                [BIN, "--repo", folder],
                { encoding: "utf8" },
            );

            expect(stderr).toContain(`fitness: ${folder} is not a git checkout`);
            expect(stdout).toBe("");
            expect(status).toBe(1);
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
    });
});
