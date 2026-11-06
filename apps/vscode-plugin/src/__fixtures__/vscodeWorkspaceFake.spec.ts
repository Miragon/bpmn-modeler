import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openWorkspaceFolder, resetVscodeWorkspace, workspace } from "./vscodeWorkspaceFake";

// VS Code's search runs ripgrep with --follow under the default search.followSymlinks.
describe("findFiles of the vscode workspace fake through symbolic links", () => {
    let root: string;
    let outside: string;

    beforeAll(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "vscode-fake-links-"));
        outside = await fs.mkdtemp(join(tmpdir(), "vscode-fake-links-target-"));
        for (const dir of ["src/broken", "web"]) {
            await fs.mkdir(join(root, dir), { recursive: true });
        }
        for (const dir of ["models", "pkg"]) {
            await fs.mkdir(join(outside, dir), { recursive: true });
        }
        await fs.writeFile(join(root, "src/a.bpmn"), "");
        await fs.writeFile(join(outside, "models/b.bpmn"), "");
        await fs.writeFile(join(outside, "c.bpmn"), "");
        await fs.writeFile(join(outside, "pkg/d.bpmn"), "");
        await fs.symlink(join(outside, "models"), join(root, "src/linked"), "dir");
        await fs.symlink(join(outside, "c.bpmn"), join(root, "src/c.bpmn"));
        await fs.symlink(join(outside, "pkg"), join(root, "web/node_modules"), "dir");
        await fs.symlink(join(outside, "pkg"), join(root, "web/vendor"), "dir");
        await fs.symlink(root, join(root, "src/loop"), "dir");
        await fs.symlink(join(outside, "missing.bpmn"), join(root, "src/broken/gone.bpmn"));
        await fs.symlink("self", join(root, "src/broken/self"));
    });

    afterAll(async () => {
        resetVscodeWorkspace();
        await fs.rm(root, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
    });

    async function findPaths(include: string, exclude?: string | null): Promise<string[]> {
        resetVscodeWorkspace();
        openWorkspaceFolder(root);
        const found = await workspace.findFiles(include, exclude);
        return found.map((uri) => uri.fsPath).sort();
    }

    it("lists the files behind a symlinked folder", async () => {
        await expect(findPaths("**/linked/*.bpmn")).resolves.toEqual([
            join(root, "src/linked/b.bpmn"),
        ]);
    });

    it("lists a symlinked file under its own path", async () => {
        await expect(findPaths("**/c.bpmn")).resolves.toEqual([join(root, "src/c.bpmn")]);
    });

    it("lists no file behind a symlinked folder the exclude covers", async () => {
        await expect(findPaths("**/*.bpmn", "**/node_modules/**")).resolves.toEqual([
            join(root, "src/a.bpmn"),
            join(root, "src/c.bpmn"),
            join(root, "src/linked/b.bpmn"),
            join(root, "web/vendor/d.bpmn"),
        ]);
    });

    it("does not follow a symlinked folder the exclude names", async () => {
        await expect(findPaths("web/**", "**/vendor")).resolves.toEqual([
            join(root, "web/node_modules/d.bpmn"),
        ]);
    });

    it("lists each file once through a symlink to an enclosing folder", async () => {
        await expect(findPaths("**/a.bpmn")).resolves.toEqual([join(root, "src/a.bpmn")]);
    });

    it("skips a symlink that dangles or points at itself", async () => {
        await expect(findPaths("src/broken/**")).resolves.toEqual([]);
    });
});
