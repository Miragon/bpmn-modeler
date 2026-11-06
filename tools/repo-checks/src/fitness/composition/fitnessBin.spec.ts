import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

    it("measures the checkout --repo names, and exits 1 on a folder that is none", () => {
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
