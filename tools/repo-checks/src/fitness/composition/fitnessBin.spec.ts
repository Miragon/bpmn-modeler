import { spawnSync } from "node:child_process";
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
});
