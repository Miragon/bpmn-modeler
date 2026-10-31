import {
    allowedTypes,
    bindingSpecOf,
    feelSupport,
    initialBinding,
    sampleValue,
    type BindingSpec,
    type EngineCatalog,
    type PropertyType,
    type Requirement,
} from "../catalog";
import type { JsonPath, TemplateEdit } from "./templateText";

type Json = Record<string, unknown>;

const FEEL_TYPES: readonly string[] = ["String", "Text", "Number", "Boolean"];
const PLACEHOLDER_TYPES: readonly string[] = ["String", "Text"];

/**
 * Sets the value at `path`. An empty text or `undefined` removes the key; when
 * `template` is given, a key that is already missing yields no edit.
 */
export function setField(path: JsonPath, value: unknown, template?: Json): TemplateEdit[] {
    if (value === undefined || value === "") {
        return template && valueAt(template, path) === undefined ? [] : [{ kind: "remove", path }];
    }
    return [{ kind: "set", path, value }];
}

/** Appends a property with the engine's default binding. */
export function addProperty(template: Json, catalog: EngineCatalog): TemplateEdit[] {
    const spec = catalog.bindings[0];
    const binding = initialBinding(spec);
    const property = fitted({ label: "New property", binding }, spec, binding);
    return appendTo(template, ["properties"], property);
}

export function removeProperty(index: number): TemplateEdit[] {
    return [{ kind: "remove", path: ["properties", index] }];
}

/** Moves a property so that it ends up at index `to`. */
export function moveProperty(template: Json, from: number, to: number): TemplateEdit[] {
    if (from === to) {
        return [];
    }
    return [
        { kind: "remove", path: ["properties", from] },
        { kind: "insert", path: ["properties", to], value: propertyAt(template, from) },
    ];
}

/** Inserts a copy right after the property, with a label and an id that tell it apart. */
export function duplicateProperty(template: Json, index: number): TemplateEdit[] {
    const copy: Json = structuredClone(propertyAt(template, index));
    if (typeof copy.label === "string") {
        copy.label = `${copy.label} (copy)`;
    }
    if (typeof copy.id === "string") {
        const ids = propertiesOf(template).map((property) => property.id);
        copy.id = unused(`${copy.id}-copy`, ids);
    }
    return [{ kind: "insert", path: ["properties", index + 1], value: copy }];
}

/**
 * Switches a property to another binding: the new binding starts from its
 * defaults, keeps text fields both bindings share, and the property drops what
 * the new binding does not allow.
 */
export function changeBindingType(
    template: Json,
    catalog: EngineCatalog,
    index: number,
    type: string,
): TemplateEdit[] {
    const spec = bindingSpecOf(catalog, type);
    if (!spec) {
        return [];
    }
    const property = propertyAt(template, index);
    const previous = objectAt(property, "binding");
    const binding = initialBinding(spec);
    for (const field of spec.fields) {
        if (field.kind === "text" && typeof previous[field.key] === "string") {
            binding[field.key] = previous[field.key];
        }
    }
    return diffEdits(
        ["properties", index],
        property,
        fitted({ ...property, binding }, spec, binding),
    );
}

/** Changes one binding field; selecting another variant applies that variant's rules. */
export function changeBindingField(
    template: Json,
    catalog: EngineCatalog,
    index: number,
    key: string,
    value: unknown,
): TemplateEdit[] {
    const property = propertyAt(template, index);
    const binding: Json = { ...objectAt(property, "binding") };
    if (value === undefined || value === "") {
        delete binding[key];
    } else {
        binding[key] = value;
    }
    const spec = bindingSpecOf(catalog, binding.type);
    const next = spec ? fitted({ ...property, binding }, spec, binding) : { ...property, binding };
    return diffEdits(["properties", index], property, next);
}

/** Changes the property's type and converts what depends on it: value, choices, FEEL, placeholder. */
export function changePropertyType(
    template: Json,
    catalog: EngineCatalog,
    index: number,
    type: string,
): TemplateEdit[] {
    const property = propertyAt(template, index);
    const binding = objectAt(property, "binding");
    const spec = bindingSpecOf(catalog, binding.type);
    const retyped = withType(property, type);
    const next = spec ? fitted(retyped, spec, binding) : retyped;
    return diffEdits(["properties", index], property, next);
}

export function addChoice(template: Json, index: number): TemplateEdit[] {
    const choices = arrayAt(propertyAt(template, index), "choices");
    const number = choices.length + 1;
    return appendTo(propertyAt(template, index), ["properties", index, "choices"], {
        name: `Option ${number}`,
        value: `option-${number}`,
    });
}

export function updateChoice(
    index: number,
    choice: number,
    key: string,
    value: string,
): TemplateEdit[] {
    return [{ kind: "set", path: ["properties", index, "choices", choice, key], value }];
}

export function removeChoice(index: number, choice: number): TemplateEdit[] {
    return [{ kind: "remove", path: ["properties", index, "choices", choice] }];
}

export function addGroup(template: Json): TemplateEdit[] {
    const groups = arrayAt(template, "groups");
    const ids = groups.map((group) => (isObject(group) ? group.id : undefined));
    const id = unused(`group-${groups.length + 1}`, ids);
    return appendTo(template, ["groups"], { id, label: "New group" });
}

/** Renames a group and moves its properties along. */
export function renameGroup(template: Json, index: number, id: string): TemplateEdit[] {
    const previous = objectAt(template, "groups", index).id;
    return [
        { kind: "set", path: ["groups", index, "id"], value: id },
        ...propertyIndexesIn(template, previous).map((property): TemplateEdit => ({
            kind: "set",
            path: ["properties", property, "group"],
            value: id,
        })),
    ];
}

/** Removes a group; its properties move to the default group. */
export function removeGroup(template: Json, index: number): TemplateEdit[] {
    const id = objectAt(template, "groups", index).id;
    return [
        ...propertyIndexesIn(template, id).map((property): TemplateEdit => ({
            kind: "remove",
            path: ["properties", property, "group"],
        })),
        { kind: "remove", path: ["groups", index] },
    ];
}

/** Sets or clears one constraint; clearing the last one removes `constraints`. */
export function setConstraint(
    template: Json,
    index: number,
    key: string,
    value: unknown,
): TemplateEdit[] {
    const constraints = objectAt(propertyAt(template, index), "constraints");
    const path: JsonPath = ["properties", index, "constraints"];
    if (value !== undefined && value !== "") {
        return [{ kind: "set", path: [...path, key], value }];
    }
    const remaining = Object.keys(constraints).filter((existing) => existing !== key);
    return [{ kind: "remove", path: remaining.length === 0 ? path : [...path, key] }];
}

/** Makes the template meet a binding's requirement with the first way the catalog lists. */
export function fixRequirement(
    template: Json,
    catalog: EngineCatalog,
    requirement: Requirement,
): TemplateEdit[] {
    if (requirement.kind === "elementType") {
        const [choice] = requirement.oneOf;
        const appliesTo = arrayAt(template, "appliesTo");
        return [
            { kind: "set", path: ["elementType"], value: { ...choice } },
            ...(appliesTo.includes(choice.value)
                ? []
                : appendTo(template, ["appliesTo"], choice.value)),
        ];
    }
    const spec = bindingSpecOf(catalog, requirement.binding.type);
    const binding = { ...(spec ? initialBinding(spec) : {}), ...requirement.binding };
    const value = spec ? sampleValue(spec, binding) : undefined;
    return appendTo(template, ["properties"], { type: "Hidden", value: value ?? "", binding });
}

/** The property after a change to its type, without the binding's rules. */
function withType(property: Json, type: string): Json {
    const next: Json = { ...property, type };
    const value = property.value;
    if (type === "Boolean") {
        next.value = value === true || value === "true";
    } else if (type === "Number") {
        const number = typeof value === "number" ? value : Number(value);
        if (
            typeof value === "number" ||
            (typeof value === "string" && value !== "" && !Number.isNaN(number))
        ) {
            next.value = number;
        } else {
            delete next.value;
        }
    } else if (typeof value === "boolean" || typeof value === "number") {
        next.value = String(value);
    }
    if (type === "Dropdown") {
        const choices = Array.isArray(property.choices) ? [...property.choices] : [];
        if (choices.length === 0) {
            const text =
                typeof next.value === "string" && next.value !== "" ? next.value : undefined;
            choices.push(
                text ? { name: text, value: text } : { name: "Option 1", value: "option-1" },
            );
        }
        next.choices = choices;
        const values = choices.map((choice) => (isObject(choice) ? choice.value : undefined));
        if (!values.includes(next.value)) {
            next.value = values[0];
        }
    } else {
        delete next.choices;
    }
    if (!PLACEHOLDER_TYPES.includes(type)) {
        delete next.placeholder;
    }
    if (!FEEL_TYPES.includes(type)) {
        delete next.feel;
    }
    if (type !== "Text") {
        delete next.language;
    }
    return next;
}

/** The property with only what its binding allows: type, FEEL and `optional`. */
function fitted(property: Json, spec: BindingSpec, binding: Json): Json {
    const types = allowedTypes(spec, binding);
    const next = types.includes(property.type as PropertyType)
        ? { ...property }
        : withType(property, types.includes("String") ? "String" : types[0]);
    const feel = feelSupport(spec, binding);
    if (feel === "none") {
        delete next.feel;
    } else if (feel === "required" && PLACEHOLDER_TYPES.includes(next.type as string)) {
        next.feel = "required";
    }
    if (!spec.optional) {
        delete next.optional;
    }
    return next;
}

/** Edits that turn `before` into `after`, descending into nested objects. */
function diffEdits(path: JsonPath, before: Json, after: Json): TemplateEdit[] {
    const edits: TemplateEdit[] = Object.keys(before)
        .filter((key) => !(key in after))
        .map((key) => ({ kind: "remove", path: [...path, key] }));
    for (const [key, value] of Object.entries(after)) {
        const previous = before[key];
        if (isObject(previous) && isObject(value)) {
            edits.push(...diffEdits([...path, key], previous, value));
        } else if (JSON.stringify(previous) !== JSON.stringify(value)) {
            edits.push({ kind: "set", path: [...path, key], value });
        }
    }
    return edits;
}

function appendTo(owner: Json, path: JsonPath, value: unknown): TemplateEdit[] {
    const list = valueAt(owner, path.slice(-1));
    return Array.isArray(list)
        ? [{ kind: "insert", path: [...path, list.length], value }]
        : [{ kind: "set", path, value: [value] }];
}

function propertyIndexesIn(template: Json, group: unknown): number[] {
    return propertiesOf(template).flatMap((property, index) =>
        group !== undefined && property.group === group ? [index] : [],
    );
}

function propertiesOf(template: Json): Json[] {
    return arrayAt(template, "properties").map((property) => (isObject(property) ? property : {}));
}

function propertyAt(template: Json, index: number): Json {
    return propertiesOf(template)[index] ?? {};
}

function objectAt(owner: Json, ...path: JsonPath): Json {
    const value = valueAt(owner, path);
    return isObject(value) ? value : {};
}

function arrayAt(owner: Json, key: string): unknown[] {
    const value = owner[key];
    return Array.isArray(value) ? value : [];
}

function valueAt(owner: unknown, path: JsonPath): unknown {
    return path.reduce<unknown>(
        (current, segment) =>
            current !== null && typeof current === "object"
                ? (current as Record<string | number, unknown>)[segment]
                : undefined,
        owner,
    );
}

function unused(candidate: string, taken: readonly unknown[]): string {
    let id = candidate;
    for (let suffix = 2; taken.includes(id); suffix++) {
        id = `${candidate}-${suffix}`;
    }
    return id;
}

function isObject(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
