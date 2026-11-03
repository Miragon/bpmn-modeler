import { describe, expect, it } from "vitest";

import { SeenPaths } from "./seenPaths";

describe("SeenPaths", () => {
    it("holds a path once added and drops it once forgotten", () => {
        const seen = new SeenPaths();

        seen.add("/repo/src/A.java");
        expect(seen.has("/repo/src/A.java")).toBe(true);

        seen.forget("/repo/src/A.java");
        expect(seen.has("/repo/src/A.java")).toBe(false);
    });

    it("does not count the folders above a seen path as seen", () => {
        const seen = new SeenPaths();

        seen.add("/repo/src/A.java");

        expect(seen.has("/repo/src")).toBe(false);
        expect(seen.has("/repo")).toBe(false);
    });

    it("forgets every seen path below a forgotten folder and nothing beside it", () => {
        const seen = new SeenPaths();
        seen.add("/repo/src/A.java");
        seen.add("/repo/src/main/B.java");
        seen.add("/repo/src");
        seen.add("/repo/srcs/C.java");
        seen.add("/repo/README.md");

        seen.forget("/repo/src");

        expect(seen.has("/repo/src/A.java")).toBe(false);
        expect(seen.has("/repo/src/main/B.java")).toBe(false);
        expect(seen.has("/repo/src")).toBe(false);
        expect(seen.has("/repo/srcs/C.java")).toBe(true);
        expect(seen.has("/repo/README.md")).toBe(true);
    });

    it("forgets the paths below a folder seen again after it was forgotten", () => {
        const seen = new SeenPaths();
        seen.add("/repo/src/A.java");
        seen.forget("/repo/src");
        seen.add("/repo/src/B.java");

        seen.forget("/repo/src");

        expect(seen.has("/repo/src/B.java")).toBe(false);
    });

    it("ignores forgetting a path it never saw", () => {
        const seen = new SeenPaths();
        seen.add("/repo/src/A.java");

        seen.forget("/repo/docs");

        expect(seen.has("/repo/src/A.java")).toBe(true);
    });

    // Scanning every seen path per delete took tens of seconds for this burst.
    it("forgets a branch switch's worth of deleted files without visiting the rest", () => {
        const seen = new SeenPaths();
        const files = Array.from({ length: 50_000 }, (_, i) => `/repo/src/p${i % 100}/F${i}.java`);
        files.forEach((file) => seen.add(file));

        const started = performance.now();
        files.forEach((file) => seen.forget(file));
        const elapsedMs = performance.now() - started;

        expect(files.some((file) => seen.has(file))).toBe(false);
        expect(elapsedMs).toBeLessThan(2_000);
    });
});
