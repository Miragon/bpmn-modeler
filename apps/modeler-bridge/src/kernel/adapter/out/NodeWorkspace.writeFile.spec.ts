import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toWorkspacePath } from "@miragon/bpmn-modeler-core";

import { NodeWorkspace } from "./NodeWorkspace";

describe("NodeWorkspace.writeFile", () => {
    let root: string;
    const workspace = new NodeWorkspace();

    beforeEach(async () => {
        root = toWorkspacePath(await fs.mkdtemp(join(tmpdir(), "workspace-write-")));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(root, { recursive: true, force: true });
    });

    it("never lets a concurrent reader see a partly written file", async () => {
        const path = `${root}/plugin/index.js`;
        const previous = "a".repeat(8 * 1024 * 1024);
        const next = "b".repeat(8 * 1024 * 1024);
        await workspace.writeFile(path, previous);

        const seen = new Set<string>();
        let writing = true;
        const reading = (async () => {
            while (writing) {
                const content = await fs.readFile(path, "utf8");
                seen.add(content === previous || content === next ? "whole" : "partial");
            }
        })();
        for (let round = 0; round < 5; round++) {
            await workspace.writeFile(path, round % 2 === 0 ? next : previous);
        }
        writing = false;
        await reading;

        expect(seen).toEqual(new Set(["whole"]));
    });

    it("leaves no temporary file behind after a write", async () => {
        await workspace.writeFile(`${root}/cache/style.css`, "body {}");

        await expect(fs.readdir(`${root}/cache`)).resolves.toEqual(["style.css"]);
    });

    it("leaves no temporary file behind and keeps the target when the write fails", async () => {
        await fs.mkdir(`${root}/cache/style.css`, { recursive: true });

        await expect(workspace.writeFile(`${root}/cache/style.css`, "body {}")).rejects.toThrow();

        await expect(fs.readdir(`${root}/cache`)).resolves.toEqual(["style.css"]);
        expect((await fs.stat(`${root}/cache/style.css`)).isDirectory()).toBe(true);
    });

    it("writes through a symbolic link into the file it points at", async () => {
        await workspace.writeFile(`${root}/real/order.bpmn`, "<old/>");
        await fs.symlink(`${root}/real/order.bpmn`, `${root}/order.bpmn`);

        await workspace.writeFile(`${root}/order.bpmn`, "<new/>");

        expect((await fs.lstat(`${root}/order.bpmn`)).isSymbolicLink()).toBe(true);
        await expect(fs.readFile(`${root}/real/order.bpmn`, "utf8")).resolves.toBe("<new/>");
        await expect(fs.readdir(root)).resolves.toEqual(
            expect.arrayContaining(["order.bpmn", "real"]),
        );
        await expect(fs.readdir(root)).resolves.toHaveLength(2);
    });

    it.skipIf(process.platform === "win32")("keeps the permission bits of the file it replaces", async () => {
        const path = `${root}/scripts/run.sh`;
        await workspace.writeFile(path, "echo old");
        await fs.chmod(path, 0o770);

        await workspace.writeFile(path, "echo new");

        expect((await fs.stat(path)).mode & 0o777).toBe(0o770);
    });

    it("retries replacing a file that is briefly locked", async () => {
        const path = `${root}/targets.json`;
        const rename = fs.rename.bind(fs);
        let refusals = 0;
        vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
            if (refusals < 2) {
                refusals++;
                throw Object.assign(new Error("locked"), { code: "EPERM" });
            }
            return rename(from, to);
        });

        await workspace.writeFile(path, "[]");

        await expect(fs.readFile(path, "utf8")).resolves.toBe("[]");
        await expect(fs.readdir(root)).resolves.toEqual(["targets.json"]);
    });

    it("rewrites an existing file when the resolved path comes back with backslashes, as on Windows", async () => {
        const path = `${root}/cache/index.js`;
        await workspace.writeFile(path, "old");
        const realpath = fs.realpath.bind(fs);
        vi.spyOn(fs, "realpath").mockImplementation(async (target) =>
            (await realpath(target)).replace(/\//g, "\\").replace(/^\\/, "/"),
        );

        await workspace.writeFile(path, "new");

        await expect(fs.readFile(path, "utf8")).resolves.toBe("new");
        await expect(fs.readdir(`${root}/cache`)).resolves.toEqual(["index.js"]);
    });
});
