import { describe, expect, it } from "vitest";

import { validate, validateZeebe } from "@bpmn-io/element-templates-validator";

import c7Samples from "../__fixtures__/c7-samples.json";
import c8Samples from "../__fixtures__/c8-samples.json";
import { catalogFor, type EngineCatalog } from "../catalog";
import { applyTemplateEdits, type JsonPath, type TemplateEdit } from "./templateText";
import { allowedTypes, bindingSpecOf } from "./bindingRules";
import { ruleDiagnostics } from "./diagnostics";
import {
    addGroup,
    addProperty,
    changeBindingType,
    changePropertyType,
    fixRequirement,
    moveProperty,
    removeGroup,
    removeProperty,
    renameGroup,
    setField,
} from "./transforms";

/**
 * Runs the transforms on real templates: a template that was valid stays
 * valid, and the other templates of the file stay exactly as they were.
 */

type Json = Record<string, unknown>;

function appliedText(text: string, path: JsonPath, edits: readonly TemplateEdit[]): string {
    const result = applyTemplateEdits(text, path, edits);
    if (result.kind === "refused") {
        throw new Error(`Refused an edit at ${result.path.join(".")}`);
    }
    return result.text;
}

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
                appliedText(text, [index], transform(samples[index], catalog)),
            ) as Json[];

            const errors = check(result[index]).errors ?? [];
            expect(errors.map((error) => error.message)).toEqual([]);
            expect(result.filter((_, other) => other !== index)).toEqual(
                samples.filter((_, other) => other !== index),
            );
        });
    });

    /** The other templates of the file, which no edit of this one may touch. */
    const neighboursOf = (index: number, templates: readonly Json[]) =>
        templates.filter((_, other) => other !== index);
    const editedAt = (index: number, edits: TemplateEdit[]) => {
        const result = JSON.parse(appliedText(text, [index], edits)) as Json[];
        expect(neighboursOf(index, result)).toEqual(neighboursOf(index, samples));
        return result[index];
    };
    const propertiesOf = (template: Json) =>
        (Array.isArray(template.properties) ? template.properties : []) as Json[];
    const withProperties = valid.filter(({ index }) => propertiesOf(samples[index]).length > 0);
    const withGroups = valid.filter(({ index }) =>
        Array.isArray(samples[index].groups) ? samples[index].groups.length > 0 : false,
    );

    it.each(withProperties)("removes a property of $name and stays valid", ({ index }) => {
        const template = samples[index];
        const removable = propertiesOf(template).findIndex(
            (property) => !JSON.stringify(template).includes(`"property":"${String(property.id)}"`),
        );

        const result = editedAt(index, removeProperty(Math.max(removable, 0)));

        expect(propertiesOf(result)).toHaveLength(propertiesOf(template).length - 1);
    });

    it.each(withGroups)("renames a group of $name and moves its properties", ({ index }) => {
        const template = samples[index];
        const [{ id }] = template.groups as { id: string }[];
        const members = propertiesOf(template).filter(({ group }) => group === id).length;

        const result = editedAt(index, renameGroup(template, 0, "renamed-group"));

        expect(check(result).errors ?? []).toEqual([]);
        expect(propertiesOf(result).filter(({ group }) => group === "renamed-group")).toHaveLength(
            members,
        );
        expect(propertiesOf(result).filter(({ group }) => group === id)).toEqual([]);
    });

    it.each(withGroups)("removes a group of $name and keeps its properties", ({ index }) => {
        const template = samples[index];
        const [{ id }] = template.groups as { id: string }[];

        const result = editedAt(index, removeGroup(template, 0));

        expect(check(result).errors ?? []).toEqual([]);
        expect(propertiesOf(result)).toHaveLength(propertiesOf(template).length);
        expect(propertiesOf(result).filter(({ group }) => group === id)).toEqual([]);
    });

    const bindingCases = catalog.bindings.map((spec) => ({ type: spec.type, spec }));

    describe.each(bindingCases)("switching a property to $type", ({ type, spec }) => {
        const fixtures = withProperties.slice(0, 5);

        it.each(fixtures)("keeps the file intact in $name", ({ index }) => {
            const template = samples[index];

            const result = editedAt(index, changeBindingType(template, catalog, 0, type));
            const [property] = propertiesOf(result);

            expect((property.binding as Json).type).toBe(type);
            expect(allowedTypes(spec, property.binding as Json)).toContain(property.type);

            // What the binding needs elsewhere is what its problems offer to fix.
            let fixed = result;
            for (
                let fix = ruleDiagnostics(fixed, catalog).find((found) => found.fix)?.fix;
                fix;
                fix = ruleDiagnostics(fixed, catalog).find((found) => found.fix)?.fix
            ) {
                fixed = JSON.parse(appliedText(JSON.stringify(fixed), [], fix.edits)) as Json;
            }
            expect(
                (check(fixed).errors ?? [])
                    .filter((error) => error.instancePath.startsWith("/properties/0/"))
                    .map((error) => `${error.instancePath} ${error.message}`),
            ).toEqual([]);
        });
    });

    it.each(withProperties)(
        "changes the type of $name's first property to any it allows",
        ({ index }) => {
            const template = samples[index];
            const [first] = propertiesOf(template);
            const spec = bindingSpecOf(catalog, (first.binding as Json).type);
            for (const type of spec ? allowedTypes(spec, first.binding as Json) : []) {
                const result = editedAt(index, changePropertyType(template, catalog, 0, type));

                expect(propertiesOf(result)[0].type).toBe(type);
                expect(
                    (check(result).errors ?? []).filter((error) =>
                        error.instancePath.startsWith("/properties/0"),
                    ),
                ).toEqual([]);
            }
        },
    );

    it.each(valid)(
        "fixes a missing element type of $name without touching the rest",
        ({ index }) => {
            const template = samples[index];

            const result = editedAt(
                index,
                fixRequirement(template, catalog, {
                    kind: "elementType",
                    oneOf: [{ value: "bpmn:UserTask" }],
                }),
            );

            expect(result.elementType).toEqual({ value: "bpmn:UserTask" });
            expect(result.appliesTo).toContain("bpmn:UserTask");
        },
    );

    it.each(valid)("renames $name by changing one line", ({ index }) => {
        const edited = appliedText(text, [index], setField(["name"], "Renamed"));

        const before = text.split("\n");
        const changed = edited.split("\n").filter((line, number) => line !== before[number]);
        expect(changed).toEqual([expect.stringContaining('"name": "Renamed"')]);
    });
});
