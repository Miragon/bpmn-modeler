import type { ComponentType } from "@bpmn-io/properties-panel/preact";

import type { BindingField, EngineCatalog } from "../catalog";
import { bindingOptions } from "../domain/bindingOptions";
import { allowedTypes, bindingSpecOf } from "../domain/bindingRules";
import { conditionOf, conditionRows } from "../domain/conditions";
import { elementTypeName } from "../domain/elementTypes";
import { arrayOf, objectOf, stringOf, stringsOf, valueAt, type Json } from "../domain/json";
import { normalizedNumberText, readNumberText } from "../domain/numberText";
import {
    propertyCapabilities,
    typeCapabilities,
    type PropertyCapabilities,
} from "../domain/propertyCapabilities";
import {
    jsonOnlyGroupKeys,
    jsonOnlyPropertyKeys,
    jsonOnlyTemplateKeys,
} from "../domain/templateKeys";
import type { JsonPath, TemplateEdit } from "../domain/templateText";
import {
    addChoice,
    changeBindingField,
    changeBindingType,
    changePropertyType,
    groupIdProblem,
    removeChoice,
    renameGroup,
    setConstraint,
    setField,
    updateChoice,
} from "../domain/transforms";
import {
    AppliesToEntry,
    ChoicesEntry,
    ConditionEntry,
    JsonOnlyEntry,
    type Choice,
} from "./entries";
import { entryIdOf } from "./entryIds";
import {
    CheckSetting,
    SelectSetting,
    SettingSection,
    TextSetting,
    type SelectOption,
    type Translate,
} from "./settings";

const EVENT_DEFINITIONS = [
    "bpmn:MessageEventDefinition",
    "bpmn:SignalEventDefinition",
    "bpmn:TimerEventDefinition",
    "bpmn:ConditionalEventDefinition",
];

export interface EntryContext {
    template: Json;
    catalog: EngineCatalog;
    editable: boolean;
    edit: (edits: TemplateEdit[]) => void;
    translate: Translate;
}

/** One row of the settings list, drawn by its own component. */
export interface Setting {
    id: string;
    component: ComponentType<never>;
    /** Where its value lives, so a value the JSON sets gets marked. */
    path?: JsonPath;
    label?: string;
    description?: string;
    [prop: string]: unknown;
}

/** The name people use, and the identifier the JSON holds. */
function elementTypeOption(type: string, translate: Translate): readonly [string, string] {
    return [type, `${translate(elementTypeName(type))} (${type})`];
}

export function templateEntries(ctx: EntryContext, ids: Set<string>): Setting[] {
    const { template, catalog, translate } = ctx;
    const elementType = objectOf(template.elementType);
    const elementTypeValue = typeof elementType.value === "string" ? elementType.value : "";
    const settings: Setting[] = [
        section("template-general", "General", translate),
        textEntry(ctx, ids, ["name"], "Name", {
            description: "Shown when users pick a template.",
        }),
        textEntry(ctx, ids, ["id"], "Id", {
            mono: true,
            description: "Unique together with the version.",
        }),
        numberEntry(
            ctx,
            ids,
            ["version"],
            "Version",
            "Raise it whenever you change a template that is in use.",
        ),
        section("template-documentation", "Documentation", translate),
        textEntry(ctx, ids, ["description"], "Description", {
            area: true,
            description: "Shown with the name when users pick a template.",
        }),
        textEntry(ctx, ids, ["documentationRef"], "Documentation link", {
            placeholder: "https://",
            description: "Linked from the template in the properties panel.",
        }),
        section("template-elements", "Elements", translate),
        {
            id: register(ids, ["appliesTo"]),
            component: AppliesToEntry,
            path: ["appliesTo"],
            label: translate("Applies to"),
            description: translate("The elements users can apply the template to."),
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
            description: "Turns the element into this type when the template is applied.",
            value: elementTypeValue,
            options: [
                ["", translate("The element it is applied to")],
                ...withCurrent(catalog.elementTypes, elementTypeValue).map((type) =>
                    elementTypeOption(type, translate),
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
        settings.push(
            selectEntry(ctx, ids, ["elementType", "eventDefinition"], "Event definition", {
                description: "The event definition the created event gets.",
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
    return [...settings, ...jsonOnly(ctx, "template", jsonOnlyTemplateKeys(template))];
}

export function groupEntries(
    ctx: EntryContext,
    ids: Set<string>,
    group: Json,
    index: number,
): Setting[] {
    const { template, translate } = ctx;
    const idMessages = {
        empty: () => translate("Enter an id."),
        taken: (id: string) => translate('Another group already has the id "{id}".', { id }),
    };
    return [
        {
            ...textEntry(ctx, ids, ["groups", index, "id"], "Id", {
                mono: true,
                description: "Properties join the group with this id.",
            }),
            validate: (value: string) => {
                const problem = groupIdProblem(template, index, value);
                return problem ? idMessages[problem](value) : null;
            },
            setValue: (value: string) => ctx.edit(renameGroup(template, index, value)),
        },
        textEntry(ctx, ids, ["groups", index, "label"], "Label", {
            description: "The group's heading in the properties panel.",
        }),
        ...jsonOnly(ctx, `group-${index}`, jsonOnlyGroupKeys(group)),
    ];
}

/**
 * The bindings for the template's element first, then those for other elements,
 * whose problem says what to do, then what can only be edited in the JSON so far.
 */
function bindingSelectOptions(ctx: EntryContext, current: string): SelectOption[] {
    const { template, catalog, translate } = ctx;
    const { fitting, otherElements, jsonOnly } = bindingOptions(catalog, template);
    const named = ({ type, label }: { type: string; label: string }) => ({
        value: type,
        label: `${translate(label)} (${type})`,
    });
    const editable = [...fitting, ...otherElements].map(({ type }) => type);
    const others = translate("For other element types");
    const inJson = translate("Edit in the JSON for now");
    return [
        ...(current && !editable.includes(current) ? [{ value: current, label: current }] : []),
        ...fitting.map(named),
        ...otherElements.map((spec) => ({ ...named(spec), group: others })),
        ...jsonOnly
            .filter((type) => type !== current)
            .map((type) => ({ value: type, label: type, group: inJson, disabled: true })),
    ];
}

export function propertyEntries(
    ctx: EntryContext,
    ids: Set<string>,
    properties: Json[],
    property: Json,
    index: number,
): Setting[] {
    const { template, catalog, translate } = ctx;
    const at = (...path: JsonPath): JsonPath => ["properties", index, ...path];
    const binding = objectOf(property.binding);
    const spec = bindingSpecOf(catalog, binding.type);
    const type = stringOf(property.type);
    const extras = catalog.propertyExtras;
    const capabilities = propertyCapabilities(property, spec);
    const settings: Setting[] = [
        section(`property-${index}-basics`, "Basics", translate),
        textEntry(ctx, ids, at("label"), "Label", { description: "Shown above the field." }),
    ];

    if (extras) {
        settings.push(
            textEntry(ctx, ids, at("id"), "Id", {
                mono: true,
                description: "Lets conditions refer to this property.",
            }),
        );
    }
    settings.push(
        textEntry(ctx, ids, at("description"), "Description", {
            area: true,
            description: "Help text below the field.",
        }),
    );
    if (extras) {
        settings.push(
            textEntry(ctx, ids, at("tooltip"), "Tooltip", {
                area: true,
                description: "Shown from the info icon next to the field.",
            }),
        );
    }

    const bindingType = stringOf(binding.type);
    settings.push(
        section(`property-${index}-binding`, "Binding", translate),
        selectEntry(ctx, ids, at("binding", "type"), "Binding", {
            description: "Where the value is written.",
            value: bindingType,
            options: bindingSelectOptions(ctx, bindingType),
            onChange: (value) => ctx.edit(changeBindingType(template, catalog, index, value)),
        }),
    );
    for (const field of spec?.fields ?? []) {
        settings.push(bindingFieldEntry(ctx, ids, index, binding, field));
    }

    settings.push(section(`property-${index}-value`, "Value", translate));
    if (spec) {
        const types = allowedTypes(spec, binding);
        settings.push(
            selectEntry(ctx, ids, at("type"), "Type", {
                description: "The kind of field users see.",
                value: type,
                options: withCurrent(types, type).map(
                    (candidate) => [candidate, candidate] as const,
                ),
                onChange: (value) => ctx.edit(changePropertyType(template, catalog, index, value)),
            }),
        );
    }
    settings.push(...valueEntries(ctx, ids, property, index));
    if (capabilities.textual) {
        settings.push(
            textEntry(ctx, ids, at("placeholder"), "Placeholder", {
                description: "Shown in the empty field.",
            }),
        );
    }
    if (extras) {
        settings.push(...feelEntries(ctx, ids, capabilities, property, index));
    }

    if (capabilities.visible) {
        settings.push(
            section(`property-${index}-rules`, "Rules", translate),
            checkEntry(
                ctx,
                ids,
                at("editable"),
                "Editable",
                "Users can change the value.",
                () => property.editable !== false,
                (value) =>
                    ctx.edit(
                        value
                            ? setField(at("editable"), undefined, template)
                            : [{ kind: "set", path: at("editable"), value: false }],
                    ),
            ),
            ...constraintEntries(ctx, ids, property, index),
        );
    }

    const groupIds = arrayOf(template.groups).map(objectOf);
    const group = stringOf(property.group);
    settings.push(
        section(`property-${index}-placement`, "Placement", translate),
        selectEntry(ctx, ids, at("group"), "Group", {
            description: "The group the field appears in.",
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
        settings.push({
            id: register(ids, at("condition")),
            component: ConditionEntry,
            path: at("condition"),
            label: translate("Show only when"),
            description: translate("The field shows only while all these conditions hold."),
            rows: conditionRows(property.condition),
            typeOf,
            properties: properties.flatMap((candidate) =>
                typeof candidate.id === "string" && candidate !== property ? [candidate.id] : [],
            ),
            disabled: !ctx.editable,
            translate,
            onChange: (rows: Parameters<typeof conditionOf>[0]) =>
                ctx.edit(setField(at("condition"), conditionOf(rows, typeOf), template)),
        });
    }
    return [
        ...settings,
        ...jsonOnly(ctx, `property-${index}`, jsonOnlyPropertyKeys(property, extras)),
    ];
}

function bindingFieldEntry(
    ctx: EntryContext,
    ids: Set<string>,
    index: number,
    binding: Json,
    field: BindingField,
): Setting {
    const path: JsonPath = ["properties", index, "binding", field.key];
    const change = (value: unknown) =>
        ctx.edit(changeBindingField(ctx.template, ctx.catalog, index, field.key, value));
    if (field.kind === "flag") {
        return checkEntry(
            ctx,
            ids,
            path,
            field.label,
            field.description ?? field.label,
            () => binding[field.key] === true,
            (value) => change(value || undefined),
        );
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
        ...textEntry(ctx, ids, path, field.label, { mono: true }),
        setValue: (value: string) => change(value),
    };
}

function valueEntries(
    ctx: EntryContext,
    ids: Set<string>,
    property: Json,
    index: number,
): Setting[] {
    const path: JsonPath = ["properties", index, "value"];
    const { template, translate } = ctx;
    const startsWith = "The value new elements start with.";
    switch (property.type) {
        case "Boolean":
            return [
                checkEntry(
                    ctx,
                    ids,
                    path,
                    "Value",
                    "Checked by default.",
                    () => property.value === true,
                    (value) => ctx.edit([{ kind: "set", path, value }]),
                ),
            ];
        case "Number":
            return [numberEntry(ctx, ids, path, "Value", startsWith)];
        case "Text":
            return [textEntry(ctx, ids, path, "Value", { area: true, description: startsWith })];
        case "Hidden":
            return [
                textEntry(ctx, ids, path, "Fixed value", {
                    description: "Always written; users do not see the field.",
                }),
            ];
        case "Dropdown": {
            const choices: Choice[] = arrayOf(property.choices)
                .map(objectOf)
                .map((choice) => ({ name: stringOf(choice.name), value: stringOf(choice.value) }));
            const value = stringOf(property.value);
            return [
                selectEntry(ctx, ids, path, "Value", {
                    description: "The choice new elements start with.",
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
                    path: ["properties", index, "choices"],
                    label: translate("Choices"),
                    description: translate("The options users pick from."),
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
            return [textEntry(ctx, ids, path, "Value", { description: startsWith })];
    }
}

function feelEntries(
    ctx: EntryContext,
    ids: Set<string>,
    capabilities: PropertyCapabilities,
    property: Json,
    index: number,
): Setting[] {
    const { template, translate } = ctx;
    const settings: Setting[] = [];
    if (capabilities.feelUse === "optional") {
        settings.push(
            selectEntry(ctx, ids, ["properties", index, "feel"], "FEEL", {
                description: "Whether users may or must enter a FEEL expression.",
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
    if (capabilities.optional) {
        settings.push(
            checkEntry(
                ctx,
                ids,
                ["properties", index, "optional"],
                "Optional",
                "Leave the value out of the XML while it is empty.",
                () => property.optional === true,
                (value) =>
                    ctx.edit(
                        setField(["properties", index, "optional"], value || undefined, template),
                    ),
            ),
        );
    }
    return settings;
}

function constraintEntries(
    ctx: EntryContext,
    ids: Set<string>,
    property: Json,
    index: number,
): Setting[] {
    const { template } = ctx;
    const constraints = objectOf(property.constraints);
    const at = (key: string): JsonPath => ["properties", index, "constraints", key];
    const { textual, requirable } = typeCapabilities(property.type);
    // A type without the field keeps only the constraints the JSON already sets.
    const offered = (key: string, forType: boolean) => forType || constraints[key] !== undefined;
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
    const length = (key: string) => (value: string) => {
        const parsed = readNumberText(value);
        ctx.edit(
            setConstraint(
                template,
                index,
                key,
                parsed.kind === "number" ? parsed.value : undefined,
            ),
        );
    };
    const settings: Setting[] = [];
    if (offered("notEmpty", requirable)) {
        settings.push(
            checkEntry(
                ctx,
                ids,
                at("notEmpty"),
                "Required",
                "Users must fill in a value.",
                () => constraints.notEmpty === true,
                (value) => ctx.edit(setConstraint(template, index, "notEmpty", value || undefined)),
            ),
        );
    }
    if (offered("minLength", textual)) {
        settings.push({
            ...numberEntry(
                ctx,
                ids,
                at("minLength"),
                "Minimum length",
                "The fewest characters users may enter.",
            ),
            setValue: length("minLength"),
        });
    }
    if (offered("maxLength", textual)) {
        settings.push({
            ...numberEntry(
                ctx,
                ids,
                at("maxLength"),
                "Maximum length",
                "The most characters users may enter.",
            ),
            setValue: length("maxLength"),
        });
    }
    if (offered("pattern", textual)) {
        settings.push(
            {
                ...textEntry(ctx, ids, at("pattern"), "Pattern", {
                    mono: true,
                    description: "A regular expression the value must match.",
                }),
                getValue: () => patternValue,
                setValue: (value: string) => setPattern(value, patternMessage),
            },
            {
                ...textEntry(ctx, ids, at("patternMessage"), "Pattern message", {
                    description: "Shown when the value does not match the pattern.",
                }),
                path: [...at("pattern"), "message"],
                getValue: () => patternMessage,
                setValue: (message: string) => setPattern(patternValue, message),
                disabled: !ctx.editable || patternValue === "",
            },
        );
    }
    return settings;
}

function section(id: string, title: string, translate: Translate): Setting {
    return { id: `section-${id}`, component: SettingSection, title: translate(title) };
}

function textEntry(
    ctx: EntryContext,
    ids: Set<string>,
    path: JsonPath,
    label: string,
    options: { area?: boolean; mono?: boolean; description?: string; placeholder?: string } = {},
): Setting {
    return {
        id: register(ids, path),
        component: TextSetting,
        path,
        label: ctx.translate(label),
        description: options.description && ctx.translate(options.description),
        placeholder: options.placeholder,
        area: options.area,
        mono: options.mono,
        disabled: !ctx.editable,
        getValue: () => stringOf(valueAt(ctx.template, path)),
        setValue: (value: string) => ctx.edit(setField(path, value, ctx.template)),
    };
}

function numberEntry(
    ctx: EntryContext,
    ids: Set<string>,
    path: JsonPath,
    label: string,
    description: string,
): Setting {
    return {
        ...textEntry(ctx, ids, path, label, { description }),
        normalize: normalizedNumberText,
        validate: (value: string) =>
            readNumberText(value).kind === "invalid" ? ctx.translate("Enter a number.") : null,
        setValue: (value: string) => {
            const parsed = readNumberText(value);
            ctx.edit(
                setField(path, parsed.kind === "number" ? parsed.value : undefined, ctx.template),
            );
        },
    };
}

function selectEntry(
    ctx: EntryContext,
    ids: Set<string>,
    path: JsonPath,
    label: string,
    {
        description,
        value,
        options,
        onChange,
    }: {
        description?: string;
        value: string;
        options: readonly (readonly [string, string] | SelectOption)[];
        onChange: (value: string) => void;
    },
): Setting {
    return {
        id: register(ids, path),
        component: SelectSetting,
        path,
        label: ctx.translate(label),
        description: description && ctx.translate(description),
        disabled: !ctx.editable,
        getValue: () => value,
        getOptions: () =>
            options.map((option) =>
                "value" in option ? option : { value: option[0], label: option[1] },
            ),
        setValue: onChange,
    };
}

function checkEntry(
    ctx: EntryContext,
    ids: Set<string>,
    path: JsonPath,
    label: string,
    description: string,
    getValue: () => boolean,
    setValue: (value: boolean) => void,
): Setting {
    return {
        id: register(ids, path),
        component: CheckSetting,
        path,
        label: ctx.translate(label),
        description: ctx.translate(description),
        disabled: !ctx.editable,
        getValue,
        setValue,
    };
}

function jsonOnly(ctx: EntryContext, prefix: string, keys: readonly string[]): Setting[] {
    return keys.length > 0
        ? [{ id: `${prefix}-json-only`, component: JsonOnlyEntry, keys, translate: ctx.translate }]
        : [];
}

function register(ids: Set<string>, path: JsonPath): string {
    const id = entryIdOf(path);
    ids.add(id);
    return id;
}

function withCurrent(options: readonly string[], current: string): string[] {
    return current === "" || options.includes(current) ? [...options] : [...options, current];
}
