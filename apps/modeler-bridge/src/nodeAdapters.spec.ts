import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NodeWorkspace } from "./nodeAdapters";

/**
 * `findFiles` is the picker's one filesystem-backed prompt. These exercise its
 * real `fs.glob` behaviour against a temp tree — brace globs, the `exclude`
 * predicate, and the result cap — since no host (VS Code mock) is involved.
 */
describe("NodeWorkspace.findFiles", () => {
    let root: string;

    beforeAll(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "miranum-find-"));
        await fs.mkdir(join(root, "forms"), { recursive: true });
        // A non-dot directory so the `**/element-templates/**` exclude is actually
        // exercised — fs.glob skips dot-directories by default.
        await fs.mkdir(join(root, "config/element-templates"), { recursive: true });
        await fs.writeFile(join(root, "forms/a.form"), "{}");
        await fs.writeFile(join(root, "forms/b.json"), "{}");
        await fs.writeFile(join(root, "config/element-templates/t.json"), "{}");
    });

    afterAll(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    function workspace(): NodeWorkspace {
        const ws = new NodeWorkspace();
        ws.registerRoot(root);
        return ws;
    }

    it("matches a brace glob across the registered root", async () => {
        const found = await workspace().findFiles("**/*.{form,json}");
        expect(found.sort()).toEqual(
            [
                join(root, "config/element-templates/t.json"),
                join(root, "forms/a.form"),
                join(root, "forms/b.json"),
            ].sort(),
        );
    });

    it("drops paths matching the exclude glob", async () => {
        const found = await workspace().findFiles("**/*.json", "**/element-templates/**");
        expect(found).toEqual([join(root, "forms/b.json")]);
    });

    it("respects the result limit", async () => {
        const found = await workspace().findFiles("**/*.{form,json}", null, 1);
        expect(found).toHaveLength(1);
    });

    it("returns [] when no root is registered", async () => {
        expect(await new NodeWorkspace().findFiles("**/*.json")).toEqual([]);
    });
});
