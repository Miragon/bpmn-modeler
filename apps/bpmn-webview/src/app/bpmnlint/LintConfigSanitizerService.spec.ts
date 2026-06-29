import { describe, expect, it } from "vitest";

import { LintConfigSanitizerService } from "./LintConfigSanitizerService";

// The sanitizer owns the real built-in allow-lists (derived from the static
// resolver cache), so the tests assert against actual bpmnlint rule/config names.
const sanitizer = new LintConfigSanitizerService();

describe("LintConfigSanitizerService.sanitize", () => {
    it("keeps built-in extends and bare built-in rules untouched", () => {
        const { config, warnings } = sanitizer.sanitize({
            extends: "bpmnlint:recommended",
            rules: { "label-required": "off", "no-disconnected": "error" },
        });

        expect(config.extends).toEqual(["bpmnlint:recommended"]);
        expect(config.rules).toEqual({ "label-required": "off", "no-disconnected": "error" });
        expect(warnings).toEqual([]);
    });

    it("drops unsupported extends and custom rules, warning about each", () => {
        const { config, warnings } = sanitizer.sanitize({
            extends: ["bpmnlint:recommended", "plugin:foo/recommended"],
            rules: {
                "label-required": "warn",
                "my-plugin/foo": "error",
                "unknown-rule": "error",
            },
        });

        expect(config.extends).toEqual(["bpmnlint:recommended"]);
        expect(config.rules).toEqual({ "label-required": "warn" });
        expect(warnings).toHaveLength(3);
        expect(warnings.some((w) => w.includes("plugin:foo/recommended"))).toBe(true);
        expect(warnings.some((w) => w.includes("my-plugin/foo"))).toBe(true);
        expect(warnings.some((w) => w.includes("unknown-rule"))).toBe(true);
    });

    it("normalises a string extends and tolerates a missing rules/extends block", () => {
        expect(sanitizer.sanitize({})).toEqual({
            config: { extends: [], rules: {} },
            warnings: [],
        });

        const single = sanitizer.sanitize({ extends: "bpmnlint:all" });
        expect(single.config.extends).toEqual(["bpmnlint:all"]);
        expect(single.warnings).toEqual([]);
    });
});
