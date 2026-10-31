import { describe, expect, it } from "vitest";

import { validate, validateZeebe } from "@bpmn-io/element-templates-validator";
import { ELEMENT_TEMPLATE_SCHEMA_URL } from "@miragon/bpmn-modeler-types";

import {
    allowedTypes,
    bindingSpecOf,
    catalogFor,
    feelSupport,
    initialBinding,
    sampleValue,
    type BindingSpec,
    type EngineCatalog,
    type PropertyType,
} from "./index";

/**
 * Holds the catalog to the official schemas: every property type it allows for
 * a binding must validate, every other type must fail, and so must FEEL and
 * `optional` where the catalog says they are not allowed.
 */

const VALIDATORS = { c7: validate, c8: validateZeebe } as const;

type Json = Record<string, unknown>;

interface BindingCase {
    catalog: EngineCatalog;
    spec: BindingSpec;
    binding: Json;
    name: string;
}

function bindingCases(catalog: EngineCatalog): BindingCase[] {
    return catalog.bindings.flatMap((spec) => {
        const selector = spec.fields.find((field) => field.kind === "choice");
        const values = selector?.options ?? [undefined];
        return values.map((value) => {
            const binding = initialBinding(spec);
            if (selector && value !== undefined) {
                binding[selector.key] = value;
            }
            const name = value === undefined ? spec.type : `${spec.type} (${value})`;
            return { catalog, spec, binding, name };
        });
    });
}

function propertyOf(spec: BindingSpec, binding: Json, type: PropertyType): Json {
    const property: Json = { label: "Sample", type, binding };
    const sample = sampleValue(spec, binding) ?? "sample";
    if (type === "Dropdown") {
        property.choices = [{ name: "Sample", value: "sample" }];
        property.value = "sample";
    } else if (type === "Boolean") {
        property.value = true;
    } else if (type === "Number") {
        property.value = 1;
    } else {
        property.value = sample;
    }
    if (feelSupport(spec, binding) === "required" && (type === "String" || type === "Text")) {
        property.feel = "required";
    }
    return property;
}

function templateOf(catalog: EngineCatalog, spec: BindingSpec, property: Json): Json {
    const template: Json = {
        $schema: ELEMENT_TEMPLATE_SCHEMA_URL[catalog.engine],
        name: "Sample",
        id: "sample",
        appliesTo: ["bpmn:ServiceTask"],
        properties: [property],
    };
    const properties = template.properties as Json[];
    for (const requirement of spec.requires ?? []) {
        if (requirement.kind === "elementType") {
            const [choice] = requirement.oneOf;
            template.appliesTo = [choice.value];
            template.elementType = { ...choice };
            continue;
        }
        const satisfied = properties.some((candidate) =>
            Object.entries(requirement.binding).every(
                ([key, value]) => (candidate.binding as Json)[key] === value,
            ),
        );
        if (!satisfied) {
            const companion = bindingSpecOf(catalog, requirement.binding.type)!;
            const binding = { ...initialBinding(companion), ...requirement.binding };
            properties.push(propertyOf(companion, binding, "Hidden"));
        }
    }
    return template;
}

function errorsOf(catalog: EngineCatalog, template: Json): string[] {
    const result = VALIDATORS[catalog.engine](template);
    return result.valid
        ? []
        : result.errors.map((error) => `${error.instancePath} ${error.message}`);
}

describe.each([catalogFor("c7"), catalogFor("c8")])("the $engine catalog", (catalog) => {
    const cases = bindingCases(catalog);
    const typeCases = cases.flatMap((bindingCase) =>
        catalog.propertyTypes.map((type) => ({
            ...bindingCase,
            type,
            allowed: allowedTypes(bindingCase.spec, bindingCase.binding).includes(type),
        })),
    );

    it.each(typeCases.filter(({ allowed }) => allowed))(
        "accepts a $type property of $name",
        ({ spec, binding, type }) => {
            const template = templateOf(catalog, spec, propertyOf(spec, binding, type));

            expect(errorsOf(catalog, template)).toEqual([]);
        },
    );

    it.each(typeCases.filter(({ allowed }) => !allowed))(
        "rejects a $type property of $name",
        ({ spec, binding, type }) => {
            const template = templateOf(catalog, spec, propertyOf(spec, binding, type));

            expect(errorsOf(catalog, template)).not.toEqual([]);
        },
    );

    if (catalog.propertyExtras) {
        const textCases = cases.filter(({ spec, binding }) =>
            allowedTypes(spec, binding).includes("String"),
        );

        it.each(textCases)("allows FEEL on $name only where the catalog says", (bindingCase) => {
            const { spec, binding } = bindingCase;
            const support = feelSupport(spec, binding);
            const property: Json = {
                ...propertyOf(spec, binding, "String"),
                feel: support === "required" ? "required" : "optional",
            };
            if (support !== "none" && support !== "required") {
                property.value = "=sample";
            }

            const errors = errorsOf(catalog, templateOf(catalog, spec, property));

            expect(errors.length === 0).toBe(support !== "none");
        });

        it.each(textCases)(
            "allows an optional $name only where the catalog says",
            (bindingCase) => {
                const { spec, binding } = bindingCase;
                const property = { ...propertyOf(spec, binding, "String"), optional: true };

                const errors = errorsOf(catalog, templateOf(catalog, spec, property));

                expect(errors.length === 0).toBe(spec.optional === true);
            },
        );
    }
});
