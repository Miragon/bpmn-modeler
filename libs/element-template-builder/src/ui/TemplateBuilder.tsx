/** @jsxImportSource @bpmn-io/properties-panel/preact */
import type { ComponentChildren, ComponentType } from "@bpmn-io/properties-panel/preact";
import { useEffect, useRef, useState } from "@bpmn-io/properties-panel/preact/hooks";
import type { Engine } from "@miragon/bpmn-modeler-types";

import {
    allowedTypes,
    bindingSpecOf,
    catalogFor,
    feelSupport,
    type BindingField,
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
    duplicateProperty,
    fixRequirement,
    moveProperty,
    removeChoice,
    removeGroup,
    removeProperty,
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
import { diagnosticsByEntry, entryIdOf, type EntryDiagnostic } from "./entryIds";
import { type Problem, ProblemsBar, SeverityIcon } from "./ProblemsBar";
import {
    CheckSetting,
    Icon,
    SelectSetting,
    SettingScope,
    SettingSection,
    TextSetting,
    type Translate,
} from "./settings";

type Json = Record<string, unknown>;
type Tab = "template" | "groups" | "properties";

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
const TABS: readonly Tab[] = ["template", "groups", "properties"];

interface Context {
    template: Json;
    catalog: EngineCatalog;
    editable: boolean;
    edit: (edits: TemplateEdit[]) => void;
    translate: Translate;
}

/** One row of the settings list, drawn by its own component. */
interface Setting {
    id: string;
    component: ComponentType<never>;
    /** Where its value lives, so a value the JSON sets gets marked. */
    path?: JsonPath;
    label?: string;
    description?: string;
    [prop: string]: unknown;
}

/** The form over one template, laid out like VS Code's settings editor. */
export function TemplateBuilder({ state, onEdit, translate }: TemplateBuilderProps) {
    const { template, editable } = state;
    const catalog = catalogFor(state.engine);
    const ctx: Context = { template, catalog, editable, edit: onEdit, translate };
    const properties = arrayOf(template.properties).map(objectOf);
    const groups = arrayOf(template.groups).map(objectOf);

    const [tab, setTab] = useState<Tab>(properties.length > 0 ? "properties" : "template");
    const [chosen, setChosen] = useState({ property: 0, group: 0 });
    const [query, setQuery] = useState("");
    const [, rerender] = useState(0);
    const root = useRef<HTMLDivElement>(null);
    const pane = useRef<HTMLDivElement>(null);
    const after = useRef<{ focus?: string; top?: boolean }>({});

    const propertyIndex = Math.min(chosen.property, Math.max(properties.length - 1, 0));
    const groupIndex = Math.min(chosen.group, Math.max(groups.length - 1, 0));

    const ids = new Set<string>();
    const templateSettings = templateEntries(ctx, ids);
    const groupSettings = groups.map((group, index) => groupEntries(ctx, ids, group, index));
    const propertySettings = properties.map((property, index) =>
        propertyEntries(ctx, ids, properties, property, index),
    );
    const shown = state.diagnostics.map((diagnostic) =>
        diagnostic.verbatim
            ? diagnostic
            : { ...diagnostic, message: translate(diagnostic.message, diagnostic.replacements) },
    );
    const placed = diagnosticsByEntry(shown, ids);
    const problems: Problem[] = shown.map((diagnostic, index) => ({
        ...diagnostic,
        entryId: placed.entryIds[index],
        where: whereOf(diagnostic.path, template, translate),
    }));
    const worstUnder = (prefix: string) =>
        mostSevere(
            Object.entries(placed.byEntry).flatMap(([id, found]) =>
                id.startsWith(prefix) ? found : [],
            ),
        )?.severity;

    useEffect(() => {
        const { focus, top } = after.current;
        if (top) {
            after.current.top = false;
            pane.current?.scrollTo?.(0, 0);
        }
        const entry = focus && root.current?.querySelector(`[data-entry-id="${focus}"]`);
        // A field the user just added exists only once the edit that adds it comes back.
        if (entry) {
            after.current.focus = undefined;
            entry.scrollIntoView?.({ block: "center" });
            const control = entry.querySelector<HTMLElement>("input, textarea, select");
            control?.focus();
            // Typing replaces what is there, such as a new property's placeholder label.
            if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
                control.select();
            }
        }
    });

    const open = (next: { tab: Tab; property?: number; group?: number }, focus?: string) => {
        setTab(next.tab);
        setChosen((current) => ({
            property: next.property ?? current.property,
            group: next.group ?? current.group,
        }));
        after.current = { focus, top: !focus };
        rerender((count) => count + 1);
    };
    const showProblem = ({ entryId }: Problem) => {
        if (!entryId) {
            return;
        }
        setQuery("");
        const [kind, index] = entryId.split("-");
        if (kind === "property") {
            open({ tab: "properties", property: Number(index) }, entryId);
        } else if (kind === "group") {
            open({ tab: "groups", group: Number(index) }, entryId);
        } else {
            open({ tab: "template" }, entryId);
        }
    };

    const renderSettings = (settings: readonly Setting[]) =>
        settings.map(({ component, ...props }) => {
            const Row = component as ComponentType<Record<string, unknown>>;
            return (
                <Row
                    key={props.id}
                    {...props}
                    message={mostSevere(placed.byEntry[props.id])}
                    modified={props.path ? valueAt(template, props.path) !== undefined : false}
                />
            );
        });

    const needle = query.trim().toLowerCase();
    const matches = (...texts: unknown[]) =>
        texts.some((text) => stringOf(text).toLowerCase().includes(needle));
    const tabLabels: Record<Tab, string> = {
        template: translate("Template"),
        groups: translate("Groups"),
        properties: translate("Properties"),
    };
    const searchLabels: Record<Tab, string> = {
        template: translate("Search template settings"),
        groups: translate("Search groups"),
        properties: translate("Search properties"),
    };

    let index: ComponentChildren = null;
    let content: ComponentChildren;
    if (tab === "template") {
        const visible = needle ? filterSettings(templateSettings, matches) : templateSettings;
        content = (
            <>
                <Heading
                    title={stringOf(template.name) || translate("Untitled template")}
                    meta={stringOf(template.id)}
                />
                <SettingScope.Provider value={tabLabels.template}>
                    {renderSettings(visible)}
                </SettingScope.Provider>
                {visible.length === 0 ? (
                    <p class="etb-empty">{translate("No settings match your search.")}</p>
                ) : null}
            </>
        );
    } else if (tab === "groups") {
        const group = groups[groupIndex];
        const title = group ? groupTitle(group, translate) : "";
        index = (
            <Index
                label={tabLabels.groups}
                items={groups.flatMap((candidate, at) =>
                    !needle || matches(groupTitle(candidate, translate), candidate.id)
                        ? [
                              {
                                  index: at,
                                  title: groupTitle(candidate, translate),
                                  severity: worstUnder(`group-${at}-`),
                              },
                          ]
                        : [],
                )}
                selected={groupIndex}
                onSelect={(at) => open({ tab: "groups", group: at })}
                empty={
                    groups.length === 0
                        ? translate("No groups yet.")
                        : translate("No groups match your search.")
                }
                addLabel={translate("Add group")}
                onAdd={
                    editable
                        ? () => {
                              open(
                                  { tab: "groups", group: groups.length },
                                  entryIdOf(["groups", groups.length, "label"]),
                              );
                              onEdit(addGroup(template));
                          }
                        : undefined
                }
            />
        );
        content = group ? (
            <>
                <Heading title={title} meta={stringOf(group.id)}>
                    {editable ? (
                        <Action
                            icon="trash"
                            label={translate("Delete group")}
                            onClick={() => {
                                open({ tab: "groups", group: Math.max(groupIndex - 1, 0) });
                                onEdit(removeGroup(template, groupIndex));
                            }}
                        />
                    ) : null}
                </Heading>
                <SettingScope.Provider value={title}>
                    {renderSettings(groupSettings[groupIndex])}
                </SettingScope.Provider>
            </>
        ) : (
            <p class="etb-empty">
                {translate(
                    "Groups put properties under their own heading in the properties panel.",
                )}
            </p>
        );
    } else {
        const property = properties[propertyIndex];
        const title = property ? propertyTitle(property, translate) : "";
        const last = properties.length - 1;
        index = (
            <Index
                label={tabLabels.properties}
                items={properties.flatMap((candidate, at) => {
                    const binding = objectOf(candidate.binding);
                    return !needle ||
                        matches(
                            propertyTitle(candidate, translate),
                            candidate.id,
                            candidate.type,
                            binding.type,
                            ...BINDING_TARGET_KEYS.map((key) => binding[key]),
                        )
                        ? [
                              {
                                  index: at,
                                  title: propertyTitle(candidate, translate),
                                  severity: worstUnder(`property-${at}-`),
                              },
                          ]
                        : [];
                })}
                selected={propertyIndex}
                onSelect={(at) => open({ tab: "properties", property: at })}
                empty={
                    properties.length === 0
                        ? translate("No properties yet.")
                        : translate("No properties match your search.")
                }
                addLabel={translate("Add property")}
                onAdd={
                    editable
                        ? () => {
                              open(
                                  { tab: "properties", property: properties.length },
                                  entryIdOf(["properties", properties.length, "label"]),
                              );
                              onEdit(addProperty(template, catalog));
                          }
                        : undefined
                }
            />
        );
        const binding = objectOf(property?.binding);
        content = property ? (
            <>
                <Heading
                    title={title}
                    meta={[stringOf(binding.type), stringOf(property.type)]
                        .filter(Boolean)
                        .join(" · ")}
                >
                    {editable ? (
                        <>
                            <Action
                                icon="arrowUp"
                                label={translate("Move up")}
                                disabled={propertyIndex === 0}
                                onClick={() => {
                                    open({ tab: "properties", property: propertyIndex - 1 });
                                    onEdit(
                                        moveProperty(template, propertyIndex, propertyIndex - 1),
                                    );
                                }}
                            />
                            <Action
                                icon="arrowDown"
                                label={translate("Move down")}
                                disabled={propertyIndex === last}
                                onClick={() => {
                                    open({ tab: "properties", property: propertyIndex + 1 });
                                    onEdit(
                                        moveProperty(template, propertyIndex, propertyIndex + 1),
                                    );
                                }}
                            />
                            <Action
                                icon="copy"
                                label={translate("Duplicate property")}
                                onClick={() => {
                                    open({ tab: "properties", property: propertyIndex + 1 });
                                    onEdit(duplicateProperty(template, propertyIndex));
                                }}
                            />
                            <Action
                                icon="trash"
                                label={translate("Delete property")}
                                onClick={() => {
                                    open({
                                        tab: "properties",
                                        property: Math.min(propertyIndex, last - 1),
                                    });
                                    onEdit(removeProperty(propertyIndex));
                                }}
                            />
                        </>
                    ) : null}
                </Heading>
                <SettingScope.Provider value={title}>
                    {renderSettings(propertySettings[propertyIndex])}
                </SettingScope.Provider>
            </>
        ) : (
            <p class="etb-empty">{translate("Add a property for each field users fill in.")}</p>
        );
    }

    return (
        <div class="etb-layout" ref={root}>
            <div class="etb-header">
                <div class="etb-search">
                    <Icon name="search" />
                    <input
                        id="etb-search"
                        class="etb-search__input"
                        type="text"
                        value={query}
                        placeholder={searchLabels[tab]}
                        aria-label={searchLabels[tab]}
                        spellcheck={false}
                        onInput={(event: Event) =>
                            setQuery((event.currentTarget as HTMLInputElement).value)
                        }
                    />
                    {query ? (
                        <Action
                            icon="close"
                            label={translate("Clear search")}
                            onClick={() => setQuery("")}
                        />
                    ) : null}
                </div>
                <div
                    class="etb-tabs"
                    role="tablist"
                    aria-label={translate("Parts of the template")}
                >
                    {TABS.map((key) => {
                        const severity = worstUnder(
                            key === "template"
                                ? "template-"
                                : key === "groups"
                                  ? "group-"
                                  : "property-",
                        );
                        return (
                            <button
                                type="button"
                                role="tab"
                                key={key}
                                id={`etb-tab-${key}`}
                                class="etb-tab"
                                aria-selected={tab === key}
                                onClick={() => setTab(key)}
                            >
                                {tabLabels[key]}
                                {key !== "template" ? (
                                    <span class="etb-count">
                                        {key === "groups" ? groups.length : properties.length}
                                    </span>
                                ) : null}
                                {severity ? <SeverityIcon kind={severity} /> : null}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div class="etb-body">
                {index}
                <div class="etb-pane" ref={pane} role="tabpanel" aria-labelledby={`etb-tab-${tab}`}>
                    {content}
                </div>
            </div>
            <ProblemsBar
                problems={problems}
                disabled={!editable}
                translate={translate}
                onShow={showProblem}
                onFix={(problem) =>
                    problem.fix &&
                    onEdit(fixRequirement(template, catalog, problem.fix.requirement))
                }
            />
        </div>
    );
}

function Heading({
    title,
    meta,
    children,
}: {
    title: string;
    meta?: string;
    children?: ComponentChildren;
}) {
    return (
        <div class="etb-heading">
            <h2 class="etb-heading__title">{title}</h2>
            {meta ? <span class="etb-heading__meta">{meta}</span> : null}
            {children ? <span class="etb-heading__actions">{children}</span> : null}
        </div>
    );
}

function Action({
    icon,
    label,
    disabled,
    onClick,
}: {
    icon: Parameters<typeof Icon>[0]["name"];
    label: string;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            class="etb-icon-button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
        >
            <Icon name={icon} />
        </button>
    );
}

interface IndexItem {
    index: number;
    title: string;
    severity?: EntryDiagnostic["severity"];
}

/** The left column: what the tab lists, like the table of contents of VS Code's settings. */
function Index({
    label,
    items,
    selected,
    onSelect,
    empty,
    addLabel,
    onAdd,
}: {
    label: string;
    items: readonly IndexItem[];
    selected: number;
    onSelect: (index: number) => void;
    empty: string;
    addLabel: string;
    onAdd?: () => void;
}) {
    return (
        <nav class="etb-index" aria-label={label}>
            {items.length > 0 ? (
                <ul class="etb-index__list">
                    {items.map(({ index, title, severity }) => (
                        <li key={index}>
                            <button
                                type="button"
                                class={`etb-index__item${index === selected ? " etb-index__item--selected" : ""}`}
                                aria-current={index === selected ? "true" : undefined}
                                title={title}
                                onClick={() => onSelect(index)}
                            >
                                <span class="etb-index__label">{title}</span>
                                {severity ? <SeverityIcon kind={severity} /> : null}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p class="etb-index__empty">{empty}</p>
            )}
            {onAdd ? (
                <button type="button" class="etb-button etb-button--secondary" onClick={onAdd}>
                    <Icon name="add" />
                    {addLabel}
                </button>
            ) : null}
        </nav>
    );
}

/** Keeps the settings whose name or description matches, and the headings above them. */
function filterSettings(
    settings: readonly Setting[],
    matches: (...texts: unknown[]) => boolean,
): Setting[] {
    const kept: Setting[] = [];
    let heading: Setting | undefined;
    for (const setting of settings) {
        if (setting.component === SettingSection) {
            heading = setting;
        } else if (matches(setting.label, setting.description)) {
            if (heading) {
                kept.push(heading);
                heading = undefined;
            }
            kept.push(setting);
        }
    }
    return kept;
}

function templateEntries(ctx: Context, ids: Set<string>): Setting[] {
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
    return [...settings, ...jsonOnly(ctx, "template", template, TEMPLATE_KEYS)];
}

function groupEntries(ctx: Context, ids: Set<string>, group: Json, index: number): Setting[] {
    const { template } = ctx;
    return [
        {
            ...textEntry(ctx, ids, ["groups", index, "id"], "Id", {
                mono: true,
                description: "Properties join the group with this id.",
            }),
            setValue: (value: string) => value && ctx.edit(renameGroup(template, index, value)),
        },
        textEntry(ctx, ids, ["groups", index, "label"], "Label", {
            description: "The group's heading in the properties panel.",
        }),
        ...jsonOnly(ctx, `group-${index}`, group, GROUP_KEYS),
    ];
}

function propertyEntries(
    ctx: Context,
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
                    (candidate) => [candidate, translate(candidate)] as const,
                ),
                onChange: (value) => ctx.edit(changePropertyType(template, catalog, index, value)),
            }),
        );
    }
    settings.push(...valueEntries(ctx, ids, property, index));
    if (type === "String" || type === "Text") {
        settings.push(
            textEntry(ctx, ids, at("placeholder"), "Placeholder", {
                description: "Shown in the empty field.",
            }),
        );
    }
    if (extras && spec) {
        settings.push(...feelEntries(ctx, ids, spec, binding, property, index));
    }

    if (type !== "Hidden") {
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
        ...jsonOnly(ctx, `property-${index}`, property, extras ? PROPERTY_KEYS : C7_PROPERTY_KEYS),
    ];
}

function bindingFieldEntry(
    ctx: Context,
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

function valueEntries(ctx: Context, ids: Set<string>, property: Json, index: number): Setting[] {
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
    ctx: Context,
    ids: Set<string>,
    spec: BindingSpec,
    binding: Json,
    property: Json,
    index: number,
): Setting[] {
    const { template, translate } = ctx;
    const settings: Setting[] = [];
    const support = feelSupport(spec, binding);
    if (
        support === "optional" &&
        ["String", "Text", "Number", "Boolean"].includes(String(property.type))
    ) {
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
    if (spec.optional) {
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

// Lengths and patterns check text; other types keep only those the JSON already sets.
const TEXT_TYPES = ["String", "Text"];

function constraintEntries(
    ctx: Context,
    ids: Set<string>,
    property: Json,
    index: number,
): Setting[] {
    const { template } = ctx;
    const constraints = objectOf(property.constraints);
    const at = (key: string): JsonPath => ["properties", index, "constraints", key];
    const textual = TEXT_TYPES.includes(stringOf(property.type));
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
    const length = (key: string) => (value: string) =>
        ctx.edit(setConstraint(template, index, key, value === "" ? undefined : Number(value)));
    const settings: Setting[] = [];
    if (offered("notEmpty", property.type !== "Boolean")) {
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
    ctx: Context,
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
    ctx: Context,
    ids: Set<string>,
    path: JsonPath,
    label: string,
    description: string,
): Setting {
    return {
        ...textEntry(ctx, ids, path, label, { description }),
        validate: (value: string) =>
            value === "" || !Number.isNaN(Number(value)) ? null : ctx.translate("Enter a number."),
        setValue: (value: string) =>
            ctx.edit(setField(path, value === "" ? undefined : Number(value), ctx.template)),
    };
}

function selectEntry(
    ctx: Context,
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
        options: readonly (readonly [string, string])[];
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
            options.map(([optionValue, optionLabel]) => ({
                value: optionValue,
                label: optionLabel,
            })),
        setValue: onChange,
    };
}

function checkEntry(
    ctx: Context,
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

function jsonOnly(ctx: Context, prefix: string, object: Json, known: readonly string[]): Setting[] {
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

const BINDING_TARGET_KEYS = ["name", "key", "property", "target", "source"];

/** A property's title in lists: its label, its id, or else its type and what it binds to. */
function propertyTitle(property: Json, translate: Translate): string {
    const binding = objectOf(property.binding);
    const target =
        BINDING_TARGET_KEYS.map((key) => stringOf(binding[key])).find(Boolean) ??
        stringOf(binding.type);
    return (
        stringOf(property.label) ||
        stringOf(property.id) ||
        [stringOf(property.type), target].filter(Boolean).join(" · ") ||
        translate("Unlabeled property")
    );
}

function groupTitle(group: Json, translate: Translate): string {
    return stringOf(group.label) || stringOf(group.id) || translate("Unnamed group");
}

/** The property or group a problem is about; template-wide problems need no name. */
function whereOf(path: JsonPath, template: Json, translate: Translate): string | undefined {
    const [list, index] = path;
    if (typeof index !== "number") {
        return undefined;
    }
    if (list === "properties") {
        return propertyTitle(objectOf(arrayOf(template.properties)[index]), translate);
    }
    return list === "groups"
        ? groupTitle(objectOf(arrayOf(template.groups)[index]), translate)
        : undefined;
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

const SEVERITY_RANK: Readonly<Record<EntryDiagnostic["severity"], number>> = {
    error: 2,
    warning: 1,
    info: 0,
};

function mostSevere(
    diagnostics: readonly EntryDiagnostic[] | undefined,
): EntryDiagnostic | undefined {
    return diagnostics?.reduce<EntryDiagnostic | undefined>(
        (worst, next) =>
            worst && SEVERITY_RANK[worst.severity] >= SEVERITY_RANK[next.severity] ? worst : next,
        undefined,
    );
}
