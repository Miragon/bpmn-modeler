/** @jsxImportSource @bpmn-io/properties-panel/preact */
import {
    CheckboxEntry,
    Group,
    ListGroup,
    PropertiesPanel,
    SelectEntry,
    TextAreaEntry,
    TextFieldEntry,
} from "@bpmn-io/properties-panel";
import { useEffect, useMemo, useRef } from "@bpmn-io/properties-panel/preact/hooks";
import type { Engine } from "@miragon/bpmn-modeler-types";

import {
    allowedTypes,
    bindingSpecOf,
    catalogFor,
    feelSupport,
    type BindingSpec,
    type EngineCatalog,
} from "../catalog";
import { conditionOf, conditionRows } from "../domain/conditions";
import type { Diagnostic } from "../domain/diagnostics";
import type { JsonPath, TemplateEdit } from "../domain/templateText";
import {
    addChoice,
    addGroup,
    addProperty,
    changeBindingField,
    changeBindingType,
    changePropertyType,
    fixRequirement,
    removeChoice,
    removeGroup,
    removeProperty,
    renameGroup,
    setConstraint,
    setField,
    updateChoice,
} from "../domain/transforms";
import { diagnosticsByEntry, entryIdOf } from "./entryIds";
import {
    AppliesToEntry,
    ChoicesEntry,
    ConditionEntry,
    JsonOnlyEntry,
    ProblemsEntry,
    type Choice,
    type Problem,
    type Translate,
} from "./entries";
import { PanelEventBus } from "./eventBus";

type Json = Record<string, unknown>;

export interface TemplateBuilderState {
    template: Json;
    engine: Engine;
    /** Whether edits are allowed; while the file's JSON is broken they are not. */
    editable: boolean;
    diagnostics: readonly Diagnostic[];
}

export interface TemplateBuilderProps {
    state: TemplateBuilderState;
    onEdit: (edits: TemplateEdit[]) => void;
    translate: Translate;
}

const EVENT_DEFINITIONS = [
    "bpmn:MessageEventDefinition",
    "bpmn:SignalEventDefinition",
    "bpmn:TimerEventDefinition",
    "bpmn:ConditionalEventDefinition",
];

const TEMPLATE_KEYS = [
    "$schema",
    "name",
    "id",
    "version",
    "description",
    "documentationRef",
    "appliesTo",
    "elementType",
    "groups",
    "properties",
];
const PROPERTY_KEYS = [
    "id",
    "label",
    "description",
    "tooltip",
    "type",
    "value",
    "placeholder",
    "optional",
    "feel",
    "editable",
    "choices",
    "constraints",
    "group",
    "condition",
    "binding",
];
const C7_PROPERTY_KEYS = PROPERTY_KEYS.filter(
    (key) => !["id", "tooltip", "optional", "feel", "condition"].includes(key),
);
const GROUP_KEYS = ["id", "label"];

const LAYOUT = {
    groups: { template: { open: true }, properties: { open: true }, problems: { open: true } },
};

// The entries debounce their input; the page already debounces what it sends.
const immediately = <F,>(fn: F): F => fn;

interface Context {
    template: Json;
    catalog: EngineCatalog;
    editable: boolean;
    edit: (edits: TemplateEdit[]) => void;
    translate: Translate;
    element: object;
}

/** The form over one template: its basics, its groups, its properties and what is wrong. */
export function TemplateBuilder({ state, onEdit, translate }: TemplateBuilderProps) {
    const element = useRef({}).current;
    const eventBus = useMemo(() => new PanelEventBus(), []);
    const catalog = catalogFor(state.engine);
    const ctx: Context = {
        template: state.template,
        catalog,
        editable: state.editable,
        edit: onEdit,
        translate,
        element,
    };

    const knownIds = new Set<string>();
    const groups: object[] = [
        templateGroup(ctx, knownIds),
        groupsGroup(ctx, knownIds),
        propertiesGroup(ctx, knownIds),
    ];
    const { byEntry, unplaced } = diagnosticsByEntry(state.diagnostics, knownIds);

    const problems: Problem[] = state.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        entryId: unplaced.includes(diagnostic)
            ? undefined
            : nearestEntry(diagnostic.path, knownIds),
    }));
    if (problems.length > 0) {
        groups.unshift({
            id: "problems",
            label: translate("Problems ({count})", { count: String(problems.length) }),
            component: Group,
            entries: [
                {
                    id: "problems-list",
                    component: ProblemsEntry,
                    problems,
                    disabled: !state.editable,
                    translate,
                    onShow: (problem: Problem) =>
                        eventBus.fire("propertiesPanel.showEntry", {
                            id: problem.entryId,
                            focus: true,
                        }),
                    onFix: (problem: Problem) =>
                        problem.fix &&
                        onEdit(fixRequirement(state.template, catalog, problem.fix.requirement)),
                },
            ],
        });
    }

    useEffect(() => {
        eventBus.fire("propertiesPanel.setDiagnostics", { diagnostics: byEntry });
    });

    return (
        <PropertiesPanel
            element={element}
            groups={groups}
            eventBus={eventBus}
            layoutConfig={LAYOUT}
        />
    );
}

function templateGroup(ctx: Context, ids: Set<string>) {
    const { template, catalog, translate } = ctx;
    const elementType = objectOf(template.elementType);
    const elementTypeValue = typeof elementType.value === "string" ? elementType.value : "";
    const entries: object[] = [
        textEntry(ctx, ids, ["name"], "Name"),
        textEntry(ctx, ids, ["id"], "Id", {
            description: translate("Unique together with the version."),
        }),
        numberEntry(ctx, ids, ["version"], "Version"),
        textEntry(ctx, ids, ["description"], "Description", { area: true }),
        textEntry(ctx, ids, ["documentationRef"], "Documentation link", {
            placeholder: "https://",
        }),
        {
            id: register(ids, ["appliesTo"]),
            component: AppliesToEntry,
            label: translate("Applies to"),
            values: stringsOf(template.appliesTo),
            options: catalog.elementTypes,
            disabled: !ctx.editable,
            translate,
            onAdd: (value: string) =>
                ctx.edit([
                    {
                        kind: "insert",
                        path: ["appliesTo", stringsOf(template.appliesTo).length],
                        value,
                    },
                ]),
            onRemove: (index: number) => ctx.edit([{ kind: "remove", path: ["appliesTo", index] }]),
        },
        selectEntry(ctx, ids, ["elementType"], "Creates element", {
            value: elementTypeValue,
            options: [
                ["", translate("The element it is applied to")],
                ...withCurrent(catalog.elementTypes, elementTypeValue).map(
                    (type) => [type, type] as const,
                ),
            ],
            onChange: (value) =>
                ctx.edit(
                    value
                        ? [{ kind: "set", path: ["elementType", "value"], value }]
                        : setField(["elementType"], undefined, template),
                ),
        }),
    ];
    if (catalog.propertyExtras && elementTypeValue.endsWith("Event")) {
        const eventDefinition =
            typeof elementType.eventDefinition === "string" ? elementType.eventDefinition : "";
        entries.push(
            selectEntry(ctx, ids, ["elementType", "eventDefinition"], "Event definition", {
                value: eventDefinition,
                options: [
                    ["", translate("None")],
                    ...withCurrent(EVENT_DEFINITIONS, eventDefinition).map(
                        (value) => [value, value] as const,
                    ),
                ],
                onChange: (value) =>
                    ctx.edit(setField(["elementType", "eventDefinition"], value, template)),
            }),
        );
    }
    const unknown = unknownKeys(template, TEMPLATE_KEYS);
    if (unknown.length > 0) {
        entries.push({
            id: "template-json-only",
            component: JsonOnlyEntry,
            keys: unknown,
            translate,
        });
    }
    return { id: "template", label: translate("Template"), component: Group, entries };
}

function groupsGroup(ctx: Context, ids: Set<string>) {
    const { template, translate } = ctx;
    const groups = arrayOf(template.groups).map(objectOf);
    return {
        id: "groups",
        label: translate("Groups"),
        component: ListGroup,
        add: ctx.editable ? () => ctx.edit(addGroup(template)) : undefined,
        items: groups.map((group, index) => ({
            id: `group-${index}`,
            label: stringOf(group.label) || stringOf(group.id) || translate("Unnamed group"),
            remove: ctx.editable ? () => ctx.edit(removeGroup(template, index)) : undefined,
            entries: [
                {
                    ...textEntry(ctx, ids, ["groups", index, "id"], "Id"),
                    setValue: (value: string) =>
                        value && ctx.edit(renameGroup(template, index, value)),
                },
                textEntry(ctx, ids, ["groups", index, "label"], "Label"),
                ...jsonOnly(ctx, `group-${index}`, group, GROUP_KEYS),
            ],
        })),
    };
}

function propertiesGroup(ctx: Context, ids: Set<string>) {
    const { template, translate } = ctx;
    const properties = arrayOf(template.properties).map(objectOf);
    return {
        id: "properties",
        label: translate("Properties"),
        component: ListGroup,
        add: ctx.editable ? () => ctx.edit(addProperty(template, ctx.catalog)) : undefined,
        items: properties.map((property, index) => ({
            id: `property-${index}`,
            label:
                stringOf(property.label) ||
                stringOf(property.id) ||
                translate("Unlabeled property"),
            remove: ctx.editable ? () => ctx.edit(removeProperty(index)) : undefined,
            autoFocusEntry: entryIdOf(["properties", index, "label"]),
            entries: propertyEntries(ctx, ids, properties, property, index),
        })),
    };
}

function propertyEntries(
    ctx: Context,
    ids: Set<string>,
    properties: Json[],
    property: Json,
    index: number,
) {
    const { template, catalog, translate } = ctx;
    const at = (...path: JsonPath): JsonPath => ["properties", index, ...path];
    const binding = objectOf(property.binding);
    const spec = bindingSpecOf(catalog, binding.type);
    const type = stringOf(property.type);
    const extras = catalog.propertyExtras;
    const entries: object[] = [textEntry(ctx, ids, at("label"), "Label")];

    if (extras) {
        entries.push(
            textEntry(ctx, ids, at("id"), "Id", {
                description: translate("Lets conditions refer to this property."),
            }),
        );
    }
    entries.push(textEntry(ctx, ids, at("description"), "Description", { area: true }));
    if (extras) {
        entries.push(textEntry(ctx, ids, at("tooltip"), "Tooltip", { area: true }));
    }

    const bindingType = stringOf(binding.type);
    entries.push(
        selectEntry(ctx, ids, at("binding", "type"), "Binding", {
            value: bindingType,
            options: withCurrent(
                catalog.bindings.map((candidate) => candidate.type),
                bindingType,
            ).map(
                (candidate) =>
                    [
                        candidate,
                        bindingSpecOf(catalog, candidate)
                            ? `${translate(bindingSpecOf(catalog, candidate)!.label)} (${candidate})`
                            : candidate,
                    ] as const,
            ),
            onChange: (value) => ctx.edit(changeBindingType(template, catalog, index, value)),
        }),
    );
    for (const field of spec?.fields ?? []) {
        entries.push(bindingFieldEntry(ctx, ids, index, binding, field));
    }

    if (spec) {
        const types = allowedTypes(spec, binding);
        entries.push(
            selectEntry(ctx, ids, at("type"), "Type", {
                value: type,
                options: withCurrent(types, type).map(
                    (candidate) => [candidate, translate(candidate)] as const,
                ),
                onChange: (value) => ctx.edit(changePropertyType(template, catalog, index, value)),
            }),
        );
    }
    entries.push(...valueEntries(ctx, ids, property, index));

    if (type === "String" || type === "Text") {
        entries.push(textEntry(ctx, ids, at("placeholder"), "Placeholder"));
    }
    if (extras && spec) {
        entries.push(...feelEntries(ctx, ids, spec, binding, property, index));
    }
    if (type !== "Hidden") {
        entries.push({
            id: register(ids, at("editable")),
            component: CheckboxEntry,
            label: translate("Users can change the value"),
            element: ctx.element,
            disabled: !ctx.editable,
            getValue: () => property.editable !== false,
            setValue: (value: boolean) =>
                ctx.edit(
                    value
                        ? setField(at("editable"), undefined, template)
                        : [{ kind: "set", path: at("editable"), value: false }],
                ),
        });
        entries.push(...constraintEntries(ctx, ids, property, index));
    }

    const groupIds = arrayOf(template.groups).map(objectOf);
    const group = stringOf(property.group);
    entries.push(
        selectEntry(ctx, ids, at("group"), "Group", {
            value: group,
            options: [
                ["", translate("Custom properties")],
                ...withCurrent(
                    groupIds.map((candidate) => stringOf(candidate.id)),
                    group,
                ).map((id) => {
                    const label = stringOf(
                        groupIds.find((candidate) => candidate.id === id)?.label,
                    );
                    return [id, label ? `${label} (${id})` : id] as const;
                }),
            ],
            onChange: (value) => ctx.edit(setField(at("group"), value, template)),
        }),
    );

    if (extras) {
        const typeOf = (id: string) =>
            stringOf(properties.find((candidate) => candidate.id === id)?.type) || undefined;
        entries.push({
            id: register(ids, at("condition")),
            component: ConditionEntry,
            label: translate("Show only when"),
            rows: conditionRows(property.condition),
            properties: properties.flatMap((candidate) =>
                typeof candidate.id === "string" && candidate !== property ? [candidate.id] : [],
            ),
            disabled: !ctx.editable,
            translate,
            onChange: (rows: Parameters<typeof conditionOf>[0]) =>
                ctx.edit(setField(at("condition"), conditionOf(rows, typeOf), template)),
        });
    }
    entries.push(
        ...jsonOnly(ctx, `property-${index}`, property, extras ? PROPERTY_KEYS : C7_PROPERTY_KEYS),
    );
    return entries;
}

function bindingFieldEntry(
    ctx: Context,
    ids: Set<string>,
    index: number,
    binding: Json,
    field: BindingSpec["fields"][number],
) {
    const path: JsonPath = ["properties", index, "binding", field.key];
    const change = (value: unknown) =>
        ctx.edit(changeBindingField(ctx.template, ctx.catalog, index, field.key, value));
    if (field.kind === "flag") {
        return {
            id: register(ids, path),
            component: CheckboxEntry,
            label: ctx.translate(field.label),
            element: ctx.element,
            disabled: !ctx.editable,
            getValue: () => binding[field.key] === true,
            setValue: (value: boolean) => change(value || undefined),
        };
    }
    if (field.kind === "choice") {
        const value = stringOf(binding[field.key]);
        return selectEntry(ctx, ids, path, field.label, {
            value,
            options: withCurrent(field.options ?? [], value).map(
                (option) => [option, option] as const,
            ),
            onChange: change,
        });
    }
    return {
        ...textEntry(ctx, ids, path, field.label),
        setValue: (value: string) => change(value),
    };
}

function valueEntries(ctx: Context, ids: Set<string>, property: Json, index: number) {
    const path: JsonPath = ["properties", index, "value"];
    const { template, translate } = ctx;
    switch (property.type) {
        case "Boolean":
            return [
                {
                    id: register(ids, path),
                    component: CheckboxEntry,
                    label: translate("Checked by default"),
                    element: ctx.element,
                    disabled: !ctx.editable,
                    getValue: () => property.value === true,
                    setValue: (value: boolean) => ctx.edit([{ kind: "set", path, value }]),
                },
            ];
        case "Number":
            return [numberEntry(ctx, ids, path, "Value")];
        case "Text":
            return [textEntry(ctx, ids, path, "Value", { area: true })];
        case "Dropdown": {
            const choices: Choice[] = arrayOf(property.choices)
                .map(objectOf)
                .map((choice) => ({ name: stringOf(choice.name), value: stringOf(choice.value) }));
            const value = stringOf(property.value);
            return [
                selectEntry(ctx, ids, path, "Value", {
                    value,
                    options: [
                        ["", translate("No value")],
                        ...withCurrent(
                            choices.map((choice) => choice.value),
                            value,
                        ).map(
                            (option) =>
                                [
                                    option,
                                    choices.find((choice) => choice.value === option)?.name ||
                                        option,
                                ] as const,
                        ),
                    ],
                    onChange: (next) => ctx.edit(setField(path, next, template)),
                }),
                {
                    id: register(ids, ["properties", index, "choices"]),
                    component: ChoicesEntry,
                    label: translate("Choices"),
                    choices,
                    disabled: !ctx.editable,
                    translate,
                    onAdd: () => ctx.edit(addChoice(template, index)),
                    onChange: (choice: number, key: "name" | "value", next: string) =>
                        ctx.edit(updateChoice(index, choice, key, next)),
                    onRemove: (choice: number) => ctx.edit(removeChoice(index, choice)),
                },
            ];
        }
        default:
            return [
                textEntry(ctx, ids, path, property.type === "Hidden" ? "Fixed value" : "Value"),
            ];
    }
}

function feelEntries(
    ctx: Context,
    ids: Set<string>,
    spec: BindingSpec,
    binding: Json,
    property: Json,
    index: number,
) {
    const { template, translate } = ctx;
    const entries: object[] = [];
    const support = feelSupport(spec, binding);
    const type = property.type;
    if (support === "optional" && ["String", "Text", "Number", "Boolean"].includes(String(type))) {
        entries.push(
            selectEntry(ctx, ids, ["properties", index, "feel"], "FEEL", {
                value: stringOf(property.feel),
                options: [
                    ["", translate("No FEEL")],
                    ["optional", translate("Users may enter FEEL")],
                    ["required", translate("The value is FEEL")],
                ],
                onChange: (value) =>
                    ctx.edit(setField(["properties", index, "feel"], value, template)),
            }),
        );
    }
    if (spec.optional) {
        entries.push({
            id: register(ids, ["properties", index, "optional"]),
            component: CheckboxEntry,
            label: translate("Leave out of the XML when empty"),
            element: ctx.element,
            disabled: !ctx.editable,
            getValue: () => property.optional === true,
            setValue: (value: boolean) =>
                ctx.edit(setField(["properties", index, "optional"], value || undefined, template)),
        });
    }
    return entries;
}

function constraintEntries(ctx: Context, ids: Set<string>, property: Json, index: number) {
    const { template, translate } = ctx;
    const constraints = objectOf(property.constraints);
    const at = (key: string): JsonPath => ["properties", index, "constraints", key];
    const pattern = constraints.pattern;
    const patternValue = typeof pattern === "string" ? pattern : stringOf(objectOf(pattern).value);
    const patternMessage = typeof pattern === "string" ? "" : stringOf(objectOf(pattern).message);
    const setPattern = (value: string, message: string) =>
        ctx.edit(
            setConstraint(
                template,
                index,
                "pattern",
                value === "" ? undefined : message ? { value, message } : value,
            ),
        );
    return [
        {
            id: register(ids, at("notEmpty")),
            component: CheckboxEntry,
            label: translate("Required"),
            element: ctx.element,
            disabled: !ctx.editable,
            getValue: () => constraints.notEmpty === true,
            setValue: (value: boolean) =>
                ctx.edit(setConstraint(template, index, "notEmpty", value || undefined)),
        },
        {
            ...numberEntry(ctx, ids, at("minLength"), "Minimum length"),
            setValue: lengthSetter(ctx, index, "minLength"),
        },
        {
            ...numberEntry(ctx, ids, at("maxLength"), "Maximum length"),
            setValue: lengthSetter(ctx, index, "maxLength"),
        },
        {
            ...textEntry(ctx, ids, at("pattern"), "Pattern"),
            getValue: () => patternValue,
            setValue: (value: string) => setPattern(value, patternMessage),
        },
        {
            ...textEntry(
                ctx,
                ids,
                ["properties", index, "constraints", "patternMessage"],
                "Message when the pattern does not match",
            ),
            getValue: () => patternMessage,
            setValue: (message: string) => setPattern(patternValue, message),
            disabled: !ctx.editable || patternValue === "",
        },
    ];
}

function lengthSetter(ctx: Context, index: number, key: string) {
    return (value: string, error?: string | null) => {
        if (!error) {
            ctx.edit(
                setConstraint(ctx.template, index, key, value === "" ? undefined : Number(value)),
            );
        }
    };
}

function textEntry(
    ctx: Context,
    ids: Set<string>,
    path: JsonPath,
    label: string,
    options: { area?: boolean; description?: string; placeholder?: string } = {},
) {
    return {
        id: register(ids, path),
        component: options.area ? TextAreaEntry : TextFieldEntry,
        label: ctx.translate(label),
        description: options.description,
        placeholder: options.placeholder,
        element: ctx.element,
        debounce: immediately,
        disabled: !ctx.editable,
        getValue: () => stringOf(valueAt(ctx.template, path)),
        setValue: (value: string) => ctx.edit(setField(path, value, ctx.template)),
    };
}

function numberEntry(ctx: Context, ids: Set<string>, path: JsonPath, label: string) {
    return {
        ...textEntry(ctx, ids, path, label),
        validate: (value: string) =>
            value === "" || !Number.isNaN(Number(value)) ? null : ctx.translate("Enter a number."),
        setValue: (value: string, error?: string | null) => {
            if (!error) {
                ctx.edit(setField(path, value === "" ? undefined : Number(value), ctx.template));
            }
        },
    };
}

function selectEntry(
    ctx: Context,
    ids: Set<string>,
    path: JsonPath,
    label: string,
    {
        value,
        options,
        onChange,
    }: {
        value: string;
        options: readonly (readonly [string, string])[];
        onChange: (value: string) => void;
    },
) {
    return {
        id: register(ids, path),
        component: SelectEntry,
        label: ctx.translate(label),
        element: ctx.element,
        disabled: !ctx.editable,
        getValue: () => value,
        getOptions: () =>
            options.map(([optionValue, optionLabel]) => ({
                value: optionValue,
                label: optionLabel,
            })),
        setValue: onChange,
    };
}

function jsonOnly(ctx: Context, prefix: string, object: Json, known: readonly string[]) {
    const keys = unknownKeys(object, known);
    return keys.length > 0
        ? [{ id: `${prefix}-json-only`, component: JsonOnlyEntry, keys, translate: ctx.translate }]
        : [];
}

function register(ids: Set<string>, path: JsonPath): string {
    const id = entryIdOf(path);
    ids.add(id);
    return id;
}

function nearestEntry(path: JsonPath, ids: ReadonlySet<string>): string | undefined {
    for (let length = path.length; length > 0; length--) {
        const id = entryIdOf(path.slice(0, length));
        if (ids.has(id)) {
            return id;
        }
    }
    return undefined;
}

function withCurrent(options: readonly string[], current: string): string[] {
    return current === "" || options.includes(current) ? [...options] : [...options, current];
}

function unknownKeys(object: Json, known: readonly string[]): string[] {
    return Object.keys(object).filter((key) => !known.includes(key));
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

function stringOf(value: unknown): string {
    return typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : "";
}

function stringsOf(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

function arrayOf(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function objectOf(value: unknown): Json {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Json)
        : {};
}
