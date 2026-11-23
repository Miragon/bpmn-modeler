import { describe, expect, it } from "vitest";

import { staticUnresolvedModdleExtensions } from "./lint";

describe("staticUnresolvedModdleExtensions", () => {
    it("returns nothing when no moddleExtensions are declared", () => {
        expect(staticUnresolvedModdleExtensions({})).toEqual([]);
    });

    it("reports string-valued extensions (a browser cannot require a module path)", () => {
        expect(
            staticUnresolvedModdleExtensions({
                moddleExtensions: { custom: "custom-moddle" },
            }),
        ).toEqual(["moddleExtension:custom"]);
    });

    it("honours object extensions on prefixes the live tree already registers", () => {
        expect(
            staticUnresolvedModdleExtensions({
                moddleExtensions: { camunda: { name: "Camunda" }, zeebe: { name: "Zeebe" } },
            }),
        ).toEqual([]);
    });

    it("reports object extensions on prefixes the live tree does not register", () => {
        expect(
            staticUnresolvedModdleExtensions({
                moddleExtensions: { acme: { name: "Acme" } },
            }),
        ).toEqual(["moddleExtension:acme"]);
    });
});
