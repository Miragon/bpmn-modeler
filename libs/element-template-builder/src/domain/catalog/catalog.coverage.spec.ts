import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { catalogFor } from "./index";

/**
 * Every binding type the official schema knows is either edited by the
 * builder or listed in the catalog as JSON-only, so a schema bump that adds one
 * fails until someone decides where it goes.
 */

const require = createRequire(import.meta.url);

const SCHEMA_PACKAGES = {
    c7: "@camunda/element-templates-json-schema",
    c8: "@camunda/zeebe-element-templates-json-schema",
} as const;

function schemaBindingTypes(engine: "c7" | "c8"): string[] {
    const path = require.resolve(`${SCHEMA_PACKAGES[engine]}/resources/schema.json`);
    const schema: unknown = JSON.parse(readFileSync(path, "utf8"));
    const types = new Set<string>();
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            node.forEach(walk);
        } else if (node && typeof node === "object") {
            const { enum: values } = node as { enum?: unknown };
            // The binding `type` enum is the one that lists the plain `property` binding.
            if (Array.isArray(values) && values.includes("property") && values.length > 3) {
                values.forEach((value) => types.add(String(value)));
            }
            Object.values(node).forEach(walk);
        }
    };
    walk(schema);
    return [...types].sort();
}

describe.each(["c7", "c8"] as const)("the %s catalog's coverage of the schema", (engine) => {
    const catalogTypes = catalogFor(engine).bindings.map((spec) => spec.type);
    const { jsonOnlyBindings: jsonOnly } = catalogFor(engine);

    it("edits or explicitly leaves every binding type of the schema", () => {
        expect([...catalogTypes, ...jsonOnly].sort()).toEqual(schemaBindingTypes(engine));
    });

    it("never both edits and leaves a binding type", () => {
        expect(catalogTypes.filter((type) => jsonOnly.includes(type))).toEqual([]);
    });
});
