import {
    validate,
    validateZeebe,
    type ValidationError,
} from "@bpmn-io/element-templates-validator";
import type { Engine } from "@miragon/bpmn-modeler-types";

import {
    catalogFor,
    type ElementTypeChoice,
    type EngineCatalog,
    type Requirement,
} from "./catalog";
import { bindingFits } from "./bindingOptions";
import { bindingSpecOf } from "./bindingRules";
import { deprecationAdvice } from "./deprecations";
import { arrayOf, objectOf, type Json } from "./json";
import { fixRequirement } from "./transforms";
import { conditionComparisons } from "./conditions";
import { elementTypeChoiceFor, meetsRequirement } from "./requirements";
import type { JsonPath, TemplateEdit } from "./templateText";

/** Something to tell about the value at `path`, relative to the template. */
export interface Diagnostic {
    path: JsonPath;
    severity: "error" | "warning" | "info";
    /** A text to translate, its `{placeholders}` filled from `replacements`. */
    message: string;
    replacements?: Record<string, string>;
    /** The validator's own English text, which no translation knows. */
    verbatim?: true;
    /** What fixes it in one step. */
    fix?: { label: string; replacements?: Record<string, string>; edits: TemplateEdit[] };
}

const VALIDATORS: Readonly<Record<Engine, typeof validate>> = { c7: validate, c8: validateZeebe };

/** Everything to tell about a template: the official validator's findings, then the builder's own. */
export function templateDiagnostics(template: Json, engine: Engine): Diagnostic[] {
    return [
        ...schemaDiagnostics(engine, template),
        ...ruleDiagnostics(template, catalogFor(engine)),
    ];
}

/** The official validator's findings, one per field and without its root-level noise. */
export function schemaDiagnostics(engine: Engine, template: unknown): Diagnostic[] {
    const result = VALIDATORS[engine](template as object);
    const findings = [
        ...(result.errors ?? []).map((error) => ({ error, severity: "error" as const })),
        ...(result.warnings ?? []).map((error) => ({ error, severity: "warning" as const })),
    ].filter(({ error }) => !isRootNoise(error));

    const withCustomMessage = new Set(
        findings
            .filter(({ error }) => error.keyword === "errorMessage")
            .map(({ error }) => error.instancePath),
    );
    const seen = new Set<string>();
    const diagnostics: Diagnostic[] = [];
    for (const { error, severity } of findings) {
        // The schema's own message replaces the generic ones at the same place.
        if (withCustomMessage.has(error.instancePath) && error.keyword !== "errorMessage") {
            continue;
        }
        const path = pathOf(error);
        const key = `${JSON.stringify(path)} ${error.message}`;
        if (!seen.has(key)) {
            seen.add(key);
            const advice =
                error.keyword === "deprecated"
                    ? deprecationAdvice(objectOf(template), path)
                    : undefined;
            diagnostics.push(
                advice
                    ? {
                          path,
                          severity,
                          message: advice.message,
                          ...(advice.fix && { fix: advice.fix }),
                      }
                    : { path, severity, message: error.message, verbatim: true },
            );
        }
    }
    return diagnostics;
}

/** What the schemas cannot check: references, choices, and what a binding needs elsewhere. */
export function ruleDiagnostics(template: Json, catalog: EngineCatalog): Diagnostic[] {
    const properties = arrayOf(template.properties);
    const ids = properties.map((property) => objectOf(property).id);
    const groupIds = arrayOf(template.groups).map((group) => objectOf(group).id);
    const formIdUsed = properties.some((property) =>
        bindingIs(objectOf(property), "zeebe:formDefinition", "formId"),
    );

    const groupDiagnostics = groupIds.flatMap((id, index): Diagnostic[] =>
        typeof id === "string" && groupIds.indexOf(id) < index
            ? [
                  {
                      path: ["groups", index, "id"],
                      severity: "error",
                      message: 'Another group already has the id "{id}".',
                      replacements: { id },
                  },
              ]
            : [],
    );

    const propertyDiagnostics = properties.flatMap((value, index) => {
        const property = objectOf(value);
        const at = (...path: JsonPath): JsonPath => ["properties", index, ...path];
        const binding = objectOf(property.binding);
        const spec = bindingSpecOf(catalog, binding.type);
        const diagnostics: Diagnostic[] = [];

        if (typeof binding.type === "string" && !spec) {
            diagnostics.push({
                path: at("binding", "type"),
                severity: "info",
                message: "The builder does not edit {binding} bindings yet; edit this one in JSON.",
                replacements: { binding: binding.type },
            });
        }
        if (typeof property.id === "string" && ids.indexOf(property.id) < index) {
            diagnostics.push({
                path: at("id"),
                severity: "error",
                message: 'Another property already has the id "{id}".',
                replacements: { id: property.id },
            });
        }
        for (const { comparison, path } of conditionComparisons(property.condition)) {
            const target = comparison.property;
            if (typeof target !== "string") {
                continue;
            }
            if (target === property.id) {
                diagnostics.push({
                    path: at("condition", ...path, "property"),
                    severity: "error",
                    message: "A property cannot depend on itself.",
                });
            } else if (!ids.includes(target)) {
                diagnostics.push({
                    path: at("condition", ...path, "property"),
                    severity: "error",
                    message: 'No property has the id "{id}".',
                    replacements: { id: target },
                });
            }
        }
        if (typeof property.group === "string" && !groupIds.includes(property.group)) {
            diagnostics.push({
                path: at("group"),
                severity: "warning",
                message:
                    'No group has the id "{id}"; the property shows under "Custom properties".',
                replacements: { id: property.group },
            });
        }
        if (property.type === "Dropdown" && property.value !== undefined) {
            const choices = arrayOf(property.choices).map((choice) => objectOf(choice).value);
            if (!choices.includes(property.value)) {
                diagnostics.push({
                    path: at("value"),
                    severity: "error",
                    message: "The value must be one of the choices.",
                });
            }
        }
        if (formIdUsed && bindingIs(property, "zeebe:formDefinition", "externalReference")) {
            diagnostics.push({
                path: at("binding", "property"),
                severity: "error",
                message: "A form is either a form id or an external reference, not both.",
            });
        }
        for (const requirement of spec?.requires ?? []) {
            if (!meetsRequirement(template, requirement)) {
                diagnostics.push(
                    requirementDiagnostic(template, catalog, at("binding", "type"), requirement),
                );
            }
        }
        // A requirement already says which element it needs, and offers to set it.
        if (spec?.elements && !bindingFits(spec, template)) {
            diagnostics.push({
                path: at("binding", "type"),
                severity: "warning",
                message: "This binding only works on: {types}.",
                replacements: { types: spec.elements.join(", ") },
            });
        }
        return diagnostics;
    });
    return [...groupDiagnostics, ...propertyDiagnostics];
}

function requirementDiagnostic(
    template: Json,
    catalog: EngineCatalog,
    path: JsonPath,
    requirement: Requirement,
): Diagnostic {
    const edits = fixRequirement(template, catalog, requirement);
    if (requirement.kind === "binding") {
        return {
            path,
            severity: "error",
            message: requirement.message,
            fix: { label: "Add it", edits },
        };
    }
    const choices = requirement.oneOf.map(describeElementType);
    return {
        path,
        severity: "error",
        ...(choices.length === 1
            ? {
                  message: "This binding needs the element type {type}.",
                  replacements: { type: choices[0] },
              }
            : {
                  message: "This binding needs one of the element types {types}.",
                  replacements: { types: choices.join(", ") },
              }),
        fix: {
            label: "Set the element type to {type}",
            replacements: {
                type: describeElementType(elementTypeChoiceFor(template, requirement.oneOf)),
            },
            edits,
        },
    };
}

function describeElementType(choice: ElementTypeChoice): string {
    return choice.eventDefinition ? `${choice.value} (${choice.eventDefinition})` : choice.value;
}

function bindingIs(property: Json, type: string, attribute: string): boolean {
    const binding = objectOf(property.binding);
    return binding.type === type && binding.property === attribute;
}

// Every invalid single template also fails "is an array" and the root `oneOf`.
function isRootNoise(error: ValidationError): boolean {
    return (
        error.instancePath === "" &&
        (error.keyword === "oneOf" || error.message === "must be array")
    );
}

function pathOf(error: ValidationError): JsonPath {
    const path: JsonPath = error.instancePath
        .split("/")
        .slice(1)
        .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
        .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
    const missing = missingKeyOf(error);
    return missing === undefined ? path : [...path, missing];
}

/** The key a `required` error misses, also behind the schema's custom message. */
function missingKeyOf(error: ValidationError): string | undefined {
    if (error.keyword === "required") {
        const missing = error.params.missingProperty;
        return typeof missing === "string" ? missing : undefined;
    }
    const raw = error.params.rawErrors;
    if (error.keyword !== "errorMessage" || !Array.isArray(raw) || raw.length === 0) {
        return undefined;
    }
    const keys = new Set(raw.map((nested: ValidationError) => missingKeyOf(nested)));
    const [key] = keys;
    return keys.size === 1 ? key : undefined;
}
