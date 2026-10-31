import { describe, expect, it } from "vitest";

import { validate, validateZeebe } from "@bpmn-io/element-templates-validator";

import c7Samples from "../__fixtures__/c7-samples.json";
import c8Samples from "../__fixtures__/c8-samples.json";
import { catalogFor, type EngineCatalog } from "../catalog";
import { applyTemplateEdits, type TemplateEdit } from "./templateText";
import { addGroup, addProperty, moveProperty, setField } from "./transforms";

/**
 * Runs the transforms on real templates: a template that was valid stays
 * valid, and the other templates of the file stay exactly as they were.
 */

type Json = Record<string, unknown>;

const TRANSFORMS: Record<string, (template: Json, catalog: EngineCatalog) => TemplateEdit[]> = {
    "a rename": () => setField(["name"], "Renamed"),
    "a new description": () => setField(["description"], "Described"),
    "a new property": (template, catalog) => addProperty(template, catalog),
    "a new group": (template) => addGroup(template),
    "moving the first property last": (template) => {
        const count = Array.isArray(template.properties) ? template.properties.length : 0;
        return count > 1 ? moveProperty(template, 0, count - 1) : [];
    },
};

const SAMPLES = [
    { engine: "c7", samples: c7Samples as unknown as Json[], check: validate },
    { engine: "c8", samples: c8Samples as unknown as Json[], check: validateZeebe },
] as const;

describe.each(SAMPLES)("transforms on the $engine samples", ({ engine, samples, check }) => {
    const text = `${JSON.stringify(samples, null, 2)}\n`;
    const catalog = catalogFor(engine);
    const valid = samples.flatMap((template, index) =>
        check(template).valid ? [{ index, name: String(template.name) }] : [],
    );

    it("has valid samples to work on", () => {
        expect(valid.length).toBeGreaterThan(3);
    });

    describe.each(Object.entries(TRANSFORMS))("%s", (_, transform) => {
        it.each(valid)("keeps $name valid and its neighbours untouched", ({ index }) => {
            const result = JSON.parse(
                applyTemplateEdits(text, [index], transform(samples[index], catalog)),
            ) as Json[];

            const errors = check(result[index]).errors ?? [];
            expect(errors.map((error) => error.message)).toEqual([]);
            expect(result.filter((_, other) => other !== index)).toEqual(
                samples.filter((_, other) => other !== index),
            );
        });
    });

    it.each(valid)("renames $name by changing one line", ({ index }) => {
        const edited = applyTemplateEdits(text, [index], setField(["name"], "Renamed"));

        const before = text.split("\n");
        const changed = edited.split("\n").filter((line, number) => line !== before[number]);
        expect(changed).toEqual([expect.stringContaining('"name": "Renamed"')]);
    });
});
