/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

const styles = readFileSync(resolve(import.meta.dirname, "index.css"), "utf8");
const localStyles = styles.replace(/^@import .*;$/gm, "");

describe("form surface theme", () => {
    beforeEach(() => {
        document.head.innerHTML = `<style>${localStyles}</style>`;
        document.body.style.color = "#cccccc";
        document.body.style.background = "#1e1e1e";
        document.body.style.colorScheme = "dark";
    });

    it.each(["form-editor", "form-preview"])(
        "keeps %s on the standard light form-js theme",
        (id) => {
            document.body.innerHTML = `<div class="form-shell"><div id="${id}" class="form-surface"></div></div>`;

            const surfaceStyle = getComputedStyle(document.getElementById(id)!);

            expect(surfaceStyle.backgroundColor).toBe("rgb(255, 255, 255)");
            expect(surfaceStyle.color).toBe("rgb(34, 36, 42)");
            expect(surfaceStyle.colorScheme).toBe("light");
        },
    );

    it("keeps the body-level form-js lightbox readable", () => {
        document.body.innerHTML = `
            <div class="fjs-powered-by-lightbox">
                <div class="notice" style="background: white">Powered by bpmn.io</div>
            </div>`;

        const noticeStyle = getComputedStyle(document.querySelector<HTMLElement>(".notice")!);

        expect(noticeStyle.backgroundColor).toBe("rgb(255, 255, 255)");
        expect(noticeStyle.color).toBe("rgb(34, 36, 42)");
        expect(noticeStyle.colorScheme).toBe("light");
    });
});
