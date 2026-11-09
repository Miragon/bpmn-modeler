import { describe, expect, it } from "vitest";

import { affectsAddOns } from "./addOnPaths";

describe("affectsAddOns", () => {
    it.each([
        { case: "a plugin file", path: "/work/.camunda/plugins/a/client.js", affects: true },
        {
            case: "a nested plugin file",
            path: "/work/orders/.camunda/plugins/a/plugin.json",
            affects: true,
        },
        { case: "the config folder itself", path: "/work/orders/.camunda", affects: true },
        { case: "a template file", path: "/work/.camunda/element-templates/a.json", affects: true },
        { case: "a diagram", path: "/work/orders/order.bpmn", affects: false },
        {
            case: "a folder named like it inside a word",
            path: "/work/x.camunda/plugins/a",
            affects: false,
        },
        {
            case: "a config folder inside node_modules",
            path: "/work/node_modules/p/.camunda/plugins/a",
            affects: false,
        },
        { case: "a path outside the root", path: "/other/.camunda/plugins/a", affects: false },
    ])("is $affects for $case", ({ path, affects }) => {
        expect(affectsAddOns(path, "/work", ".camunda")).toBe(affects);
    });

    it("follows a config folder of several segments", () => {
        expect(affectsAddOns("/work/config/camunda/plugins/a", "/work", "config/camunda")).toBe(
            true,
        );
        expect(affectsAddOns("/work/camunda/plugins/a", "/work", "config/camunda")).toBe(false);
    });
});
