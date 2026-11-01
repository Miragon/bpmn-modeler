import {
    validate,
    validateZeebe,
    type ValidationError,
} from "@bpmn-io/element-templates-validator";
import type { Engine } from "@miragon/bpmn-modeler-types";

import {
    bindingSpecOf,
    type ElementTypeChoice,
    type EngineCatalog,
    type Requirement,
} from "../catalog";
import type { JsonPath } from "./templateText";

type Json = Record<string, unknown>;

/** Something to tell about the value at `path`, relative to the template. */
export interface Diagnostic {
    path: JsonPath;
    severity: "error" | "warning" | "info";
    /** A text to translate, its `{placeholders}` filled from `replacements`. */
    message: string;
    replacements?: Record<string, string>;
    /** The validator's own English text, which no translation knows. */
    verbatim?: true;
    /** A requirement the builder can meet in one step. */
    fix?: { label: string; requirement: Requirement };
}

/** The official validator's findings, one per field and without its root-level noise. */
export function schemaDiagnostics(engine: Engine, template: unknown): Diagnostic[] {
    const result = (engine === "c7" ? validate : validateZeebe)(template as object);
    // A valid template comes back with `errors: null`.
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
            diagnostics.push({ path, severity, message: error.message, verbatim: true });
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

    return properties.flatMap((value, index) => {
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
        for (const { condition, path } of conditionsOf(property.condition)) {
            const target = condition.property;
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
            if (!meets(template, properties, requirement)) {
                diagnostics.push(requirementDiagnostic(at("binding", "type"), requirement));
            }
        }
        return diagnostics;
    });
}

function requirementDiagnostic(path: JsonPath, requirement: Requirement): Diagnostic {
    if (requirement.kind === "binding") {
        return {
            path,
            severity: "error",
            message: requirement.message,
            fix: { label: "Add it", requirement },
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
        fix: { label: "Set the element type", requirement },
    };
}

function meets(template: Json, properties: unknown[], requirement: Requirement): boolean {
    if (requirement.kind === "binding") {
        return properties.some((property) => {
            const binding = objectOf(objectOf(property).binding);
            return Object.entries(requirement.binding).every(
                ([key, value]) => binding[key] === value,
            );
        });
    }
    const elementType = objectOf(template.elementType);
    return requirement.oneOf.some(
        (choice) =>
            elementType.value === choice.value &&
            (choice.eventDefinition === undefined ||
                elementType.eventDefinition === choice.eventDefinition),
    );
}

function describeElementType(choice: ElementTypeChoice): string {
    return choice.eventDefinition ? `${choice.value} (${choice.eventDefinition})` : choice.value;
}

/** A condition and its path inside `condition`: itself, or each of `allMatch`. */
function conditionsOf(condition: unknown): { condition: Json; path: JsonPath }[] {
    const object = objectOf(condition);
    if (Array.isArray(object.allMatch)) {
        return object.allMatch.map((nested, index) => ({
            condition: objectOf(nested),
            path: ["allMatch", index],
        }));
    }
    return condition === undefined ? [] : [{ condition: object, path: [] }];
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

function arrayOf(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function objectOf(value: unknown): Json {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Json)
        : {};
}
