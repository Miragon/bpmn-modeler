import { describe, expect, it } from "vitest";

import { markdownOf } from "./markdownView";

describe("markdownOf", () => {
    it("renders headings below the detail's own, paragraphs, emphasis and code", () => {
        const root = markdownOf(
            "# Acme\n\nAdds **bold** and *calm* `code`.\n\n## Install\n\n```sh\ncp -R acme .camunda/plugins/\n```",
        );

        expect(Array.from(root.querySelectorAll("h4, h5")).map((each) => each.tagName)).toEqual([
            "H4",
            "H5",
        ]);
        expect(root.querySelector("p strong")?.textContent).toBe("bold");
        expect(root.querySelector("p em")?.textContent).toBe("calm");
        expect(root.querySelector("p code")?.textContent).toBe("code");
        expect(root.querySelector("pre code")?.textContent).toBe("cp -R acme .camunda/plugins/");
    });

    it("drops raw HTML and never runs a script", () => {
        const root = markdownOf(
            '<script>window.hacked = true</script>\n\nText <img src=x onerror="window.hacked = true"> after.',
        );

        expect(root.querySelector("script, img")).toBeNull();
        expect(root.textContent).toContain("Text");
        expect(root.textContent).toContain("after.");
        expect((window as { hacked?: boolean }).hacked).toBeUndefined();
    });

    it("keeps only absolute web and mail links as links, and an image as its alt text", () => {
        const root = markdownOf(
            "[Docs](https://example.com/docs) [Setup](./docs/setup.md) [Mail](mailto:a@b.c) " +
                "[Run](javascript:alert(1)) ![Build passing](https://ci/badge.svg)",
        );

        const links = Array.from(root.querySelectorAll("a"));
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "https://example.com/docs",
            "mailto:a@b.c",
        ]);
        expect(links[0].rel).toBe("noopener noreferrer");
        expect(root.querySelector(".av-md-link-text")?.textContent).toBe("Setup");
        expect(root.textContent).toContain("Run");
        expect(root.querySelector(".av-md-image")?.textContent).toBe("Build passing");
    });

    it("renders lists, task lists and tables", () => {
        const root = markdownOf(
            "3. three\n4. four\n\n- [x] done\n- [ ] open\n\n| Rule | Level |\n| :-- | --: |\n| no-gap | warn |",
        );

        expect(root.querySelector("ol")?.getAttribute("start")).toBe("3");
        const tasks = Array.from(root.querySelectorAll<HTMLInputElement>("input.av-md-task"));
        expect(tasks.map((box) => [box.checked, box.disabled])).toEqual([
            [true, true],
            [false, true],
        ]);
        expect(root.querySelector("ul li")?.textContent).toBe("done");
        expect(Array.from(root.querySelectorAll("th, td")).map((cell) => cell.textContent)).toEqual([
            "Rule",
            "Level",
            "no-gap",
            "warn",
        ]);
        expect(root.querySelector<HTMLElement>("td:last-child")?.style.textAlign).toBe("right");
    });
});
