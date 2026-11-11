import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(__dirname, name), "utf8");

const tokens = read("cd-tokens.generated.css");
const base = read("base.css");
const view = read("addOnsView.css");
const own = `${base}\n${view}`;

const BRAND_ASSET_CHECKSUMS = resolve(__dirname, "../../../../../../.miragon/brand-assets.sha256");
const TOKENS_SHA256 = readFileSync(BRAND_ASSET_CHECKSUMS, "utf8").match(
    /^([0-9a-f]{64}) {2}apps\/add-ons-webview\/src\/adapter\/in\/styles\/cd-tokens\.generated\.css$/m,
)?.[1];

describe("the add-ons view's stylesheets", () => {
    it("vendor the brand tokens unchanged, as the brand skill ships them", () => {
        expect([
            tokens.split("\n")[0]?.startsWith("/* AUTOMATISCH GENERIERT"),
            createHash("sha256").update(tokens).digest("hex"),
        ]).toEqual([true, TOKENS_SHA256]);
    });

    it("read no host colour: the brand wins over the IDE's look", () => {
        expect(own).not.toContain("var(--vscode-");
    });

    it("use the brand's roles in the components, never a raw colour", () => {
        expect(own.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? []).toEqual([]);
    });

    // jsdom hides a [hidden] element over any author display rule; a browser does not.
    it("keep an element hidden over its own display rule", () => {
        expect(base).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
    });

    it("draw focus, forced colours, reduced motion and high contrast", () => {
        expect([
            base.includes(":focus-visible"),
            own.includes("@media (forced-colors: active)"),
            base.includes("@media (prefers-reduced-motion: reduce)"),
            /\[data-cd-kontrast="hoch"\] :focus-visible\s*\{\s*outline-width: 3px;/.test(base),
            /\[data-cd-kontrast="hoch"\] \*\s*\{\s*box-shadow: none !important;/.test(base),
        ]).toEqual([true, true, true, true, true]);
    });

    it("pad the page's scroll by the sticky toolbar's height, which the view writes", () => {
        expect(view).toMatch(
            /html\s*\{\s*scroll-padding-top: calc\(var\(--av-sticky-top, 0px\) \+ 8px\);/,
        );
    });

    it("switch the drill-down to two panes at 640px of the view's own width", () => {
        expect([
            view.includes("@container view (max-width: 639.98px)"),
            view.includes("@container view (min-width: 640px)"),
        ]).toEqual([true, true]);
    });
});
