/** @jsxImportSource @bpmn-io/properties-panel/preact */
import type { ComponentChildren, ComponentType } from "@bpmn-io/properties-panel/preact";
import { useEffect, useReducer, useRef } from "@bpmn-io/properties-panel/preact/hooks";

import { catalogFor } from "../../domain/catalog";
import {
    BUILDER_TABS,
    initialNavigation,
    navigate,
    shownItem,
    type BuilderTab,
} from "../../domain/builderNavigation";
import type { TemplateBuilderState } from "../../domain/editorPage";
import { arrayOf, objectOf, stringOf, valueAt } from "../../domain/json";
import { problemSummary } from "../../domain/problemSummary";
import type { TemplateEdit } from "../../domain/templateText";
import { bindingTargets, groupTitle, problemPlace, propertyTitle } from "../../domain/titles";
import {
    addGroup,
    addProperty,
    duplicateProperty,
    moveProperty,
    removeGroup,
    removeProperty,
} from "../../domain/transforms";
import { diagnosticsByEntry, entryIdOf } from "../../domain/entryIds";
import { mostSevere } from "../../domain/severity";
import { Action, Heading, Index, OtherMatches } from "./parts";
import { type Problem, ProblemsBar, SeverityIcon } from "./ProblemsBar";
import {
    groupEntries,
    propertyEntries,
    templateEntries,
    type EntryContext,
    type Setting,
} from "./settingEntries";
import { Icon, SettingScope, SettingSection, type Translate } from "./settings";

export interface TemplateBuilderProps {
    state: TemplateBuilderState;
    onEdit: (edits: TemplateEdit[]) => void;
    translate: Translate;
}

/** The form over one template, laid out like VS Code's settings editor. */
export function TemplateBuilder({ state, onEdit, translate }: TemplateBuilderProps) {
    const { template, editable } = state;
    const catalog = catalogFor(state.engine);
    const ctx: EntryContext = { template, catalog, editable, edit: onEdit, translate };
    const properties = arrayOf(template.properties).map(objectOf);
    const groups = arrayOf(template.groups).map(objectOf);

    const [nav, dispatch] = useReducer(navigate, undefined, () =>
        initialNavigation(properties.length),
    );
    const root = useRef<HTMLDivElement>(null);
    const pane = useRef<HTMLDivElement>(null);

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
        where: problemPlace(diagnostic.path, template, catalog, translate),
    }));
    const worstUnder = (prefix: string) =>
        mostSevere(
            Object.entries(placed.byEntry).flatMap(([id, found]) =>
                id.startsWith(prefix) ? found : [],
            ),
        )?.severity;

    useEffect(() => {
        const { focus, scrollToTop } = nav;
        if (scrollToTop) {
            pane.current?.scrollTo?.(0, 0);
        }
        const entry = focus ? root.current?.querySelector(`[data-entry-id="${focus}"]`) : null;
        // A field the user just added exists only once the edit that adds it comes back.
        if (entry) {
            entry.scrollIntoView?.({ block: "center" });
            const control = entry.querySelector<HTMLElement>("input, textarea, select");
            control?.focus();
            // Typing replaces what is there, such as a new property's placeholder label.
            if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
                control.select();
            }
        }
        if (entry || scrollToTop) {
            dispatch({ kind: "arrived", focused: Boolean(entry) });
        }
    });

    const showProblem = ({ entryId }: Problem) => {
        if (!entryId) {
            return;
        }
        const [kind, index] = entryId.split("-");
        if (kind === "property") {
            dispatch({ kind: "show", tab: "properties", index: Number(index), focus: entryId });
        } else if (kind === "group") {
            dispatch({ kind: "show", tab: "groups", index: Number(index), focus: entryId });
        } else {
            dispatch({ kind: "show", tab: "template", focus: entryId });
        }
    };

    const renderSettings = (settings: readonly Setting[]) =>
        settings.map(({ component, ...props }) => {
            const Row = component as ComponentType<Record<string, unknown>>;
            return (
                <Row
                    key={props.id}
                    {...props}
                    message={mostSevere(placed.byEntry[props.id] ?? [])}
                    modified={props.path ? valueAt(template, props.path) !== undefined : false}
                />
            );
        });

    const needle = nav.query.trim().toLowerCase();
    const matches = (...texts: unknown[]) =>
        texts.some((text) => stringOf(text).toLowerCase().includes(needle));
    const tabLabels: Record<BuilderTab, string> = {
        template: translate("Template"),
        groups: translate("Groups"),
        properties: translate("Properties"),
    };
    const searchLabels: Record<BuilderTab, string> = {
        template: translate("Search template settings"),
        groups: translate("Search groups"),
        properties: translate("Search properties"),
    };
    const titleOfProperty = (property: (typeof properties)[number]) =>
        propertyTitle(property, catalog, translate);

    const visibleTemplateSettings = needle
        ? filterSettings(templateSettings, matches)
        : templateSettings;
    const matchingGroups = groups.flatMap((group, at) =>
        !needle || matches(groupTitle(group, translate), group.id) ? [at] : [],
    );
    const matchingProperties = properties.flatMap((property, at) => {
        const binding = objectOf(property.binding);
        return !needle ||
            matches(
                titleOfProperty(property),
                property.id,
                property.type,
                binding.type,
                ...bindingTargets(binding),
            )
            ? [at]
            : [];
    });
    const counts: Record<BuilderTab, number> = {
        template: visibleTemplateSettings.filter(({ component }) => component !== SettingSection)
            .length,
        groups: matchingGroups.length,
        properties: matchingProperties.length,
    };
    const elsewhere = needle
        ? BUILDER_TABS.filter((key) => key !== nav.tab && counts[key] > 0).map((key) => ({
              label: translate("{count} in {tab}", {
                  count: String(counts[key]),
                  tab: tabLabels[key],
              }),
              open: () => dispatch({ kind: "tab", tab: key }),
          }))
        : [];

    let index: ComponentChildren = null;
    let content: ComponentChildren;
    if (nav.tab === "template") {
        content = (
            <>
                <Heading
                    title={stringOf(template.name) || translate("Untitled template")}
                    meta={stringOf(template.id)}
                />
                <SettingScope.Provider value={tabLabels.template}>
                    {renderSettings(visibleTemplateSettings)}
                </SettingScope.Provider>
                {visibleTemplateSettings.length === 0 ? (
                    <>
                        <p class="etb-empty">{translate("No settings match your search.")}</p>
                        <OtherMatches matches={elsewhere} />
                    </>
                ) : null}
            </>
        );
    } else if (nav.tab === "groups") {
        const groupIndex = shownItem(nav.group, groups.length, matchingGroups);
        index = (
            <Index
                label={tabLabels.groups}
                items={matchingGroups.map((at) => ({
                    index: at,
                    title: groupTitle(groups[at], translate),
                    severity: worstUnder(`group-${at}-`),
                }))}
                selected={groupIndex}
                onSelect={(at) => dispatch({ kind: "open", tab: "groups", index: at })}
                empty={
                    groups.length === 0
                        ? translate("No groups yet.")
                        : translate("No groups match your search.")
                }
                addLabel={translate("Add Group")}
                onAdd={
                    editable
                        ? () => {
                              dispatch({
                                  kind: "open",
                                  tab: "groups",
                                  index: groups.length,
                                  focus: entryIdOf(["groups", groups.length, "label"]),
                              });
                              onEdit(addGroup(template));
                          }
                        : undefined
                }
            />
        );
        if (groupIndex === undefined) {
            content =
                groups.length === 0 ? (
                    <p class="etb-empty">
                        {translate(
                            "Groups put properties under their own heading in the properties panel.",
                        )}
                    </p>
                ) : (
                    <OtherMatches matches={elsewhere} />
                );
        } else {
            const group = groups[groupIndex];
            const title = groupTitle(group, translate);
            content = (
                <>
                    <Heading title={title} meta={stringOf(group.id)}>
                        {editable ? (
                            <Action
                                icon="trash"
                                label={translate("Delete group")}
                                onClick={() => {
                                    dispatch({
                                        kind: "open",
                                        tab: "groups",
                                        index: Math.max(groupIndex - 1, 0),
                                    });
                                    onEdit(removeGroup(template, groupIndex));
                                }}
                            />
                        ) : null}
                    </Heading>
                    <SettingScope.Provider value={title}>
                        {renderSettings(groupSettings[groupIndex])}
                    </SettingScope.Provider>
                </>
            );
        }
    } else {
        const propertyIndex = shownItem(nav.property, properties.length, matchingProperties);
        const last = properties.length - 1;
        index = (
            <Index
                label={tabLabels.properties}
                items={matchingProperties.map((at) => ({
                    index: at,
                    title: titleOfProperty(properties[at]),
                    severity: worstUnder(`property-${at}-`),
                }))}
                selected={propertyIndex}
                onSelect={(at) => dispatch({ kind: "open", tab: "properties", index: at })}
                empty={
                    properties.length === 0
                        ? translate("No properties yet.")
                        : translate("No properties match your search.")
                }
                addLabel={translate("Add Property")}
                onAdd={
                    editable
                        ? () => {
                              dispatch({
                                  kind: "open",
                                  tab: "properties",
                                  index: properties.length,
                                  focus: entryIdOf(["properties", properties.length, "label"]),
                              });
                              onEdit(addProperty(template, catalog));
                          }
                        : undefined
                }
            />
        );
        if (propertyIndex === undefined) {
            content =
                properties.length === 0 ? (
                    <p class="etb-empty">
                        {translate("Add a property for each field users fill in.")}
                    </p>
                ) : (
                    <OtherMatches matches={elsewhere} />
                );
        } else {
            const property = properties[propertyIndex];
            const title = titleOfProperty(property);
            const openProperty = (at: number) =>
                dispatch({ kind: "open", tab: "properties", index: at });
            content = (
                <>
                    <Heading
                        title={title}
                        meta={[stringOf(objectOf(property.binding).type), stringOf(property.type)]
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
                                        openProperty(propertyIndex - 1);
                                        onEdit(
                                            moveProperty(
                                                template,
                                                propertyIndex,
                                                propertyIndex - 1,
                                            ),
                                        );
                                    }}
                                />
                                <Action
                                    icon="arrowDown"
                                    label={translate("Move down")}
                                    disabled={propertyIndex === last}
                                    onClick={() => {
                                        openProperty(propertyIndex + 1);
                                        onEdit(
                                            moveProperty(
                                                template,
                                                propertyIndex,
                                                propertyIndex + 1,
                                            ),
                                        );
                                    }}
                                />
                                <Action
                                    icon="copy"
                                    label={translate("Duplicate property")}
                                    onClick={() => {
                                        openProperty(propertyIndex + 1);
                                        onEdit(duplicateProperty(template, propertyIndex));
                                    }}
                                />
                                <Action
                                    icon="trash"
                                    label={translate("Delete property")}
                                    onClick={() => {
                                        openProperty(Math.min(propertyIndex, last - 1));
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
            );
        }
    }

    return (
        <div
            class="etb-layout"
            ref={root}
            onKeyDown={(event: KeyboardEvent) => {
                if (event.key === "Escape") {
                    dispatch({ kind: "closeProblems" });
                }
            }}
        >
            <div class="etb-header">
                <div class="etb-search">
                    <Icon name="search" />
                    <input
                        id="etb-search"
                        class="etb-search__input"
                        type="text"
                        value={nav.query}
                        placeholder={searchLabels[nav.tab]}
                        aria-label={searchLabels[nav.tab]}
                        spellcheck={false}
                        onInput={(event: Event) =>
                            dispatch({
                                kind: "search",
                                query: (event.currentTarget as HTMLInputElement).value,
                            })
                        }
                    />
                    {nav.query ? (
                        <Action
                            icon="close"
                            label={translate("Clear search")}
                            onClick={() => dispatch({ kind: "search", query: "" })}
                        />
                    ) : null}
                </div>
                <div
                    class="etb-tabs"
                    role="tablist"
                    aria-label={translate("Parts of the template")}
                >
                    {BUILDER_TABS.map((key) => {
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
                                aria-selected={nav.tab === key}
                                onClick={() => dispatch({ kind: "tab", tab: key })}
                            >
                                {tabLabels[key]}
                                {needle || key !== "template" ? (
                                    <span class="etb-count">{counts[key]}</span>
                                ) : null}
                                {severity ? <SeverityIcon kind={severity} /> : null}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div class="etb-body">
                {index}
                <div
                    class="etb-pane"
                    ref={pane}
                    role="tabpanel"
                    aria-labelledby={`etb-tab-${nav.tab}`}
                >
                    {content}
                </div>
            </div>
            <ProblemsBar
                problems={problems}
                summary={problemSummary(shown)
                    .map(([text, replacements]) => translate(text, replacements))
                    .join(", ")}
                open={nav.problemsOpen}
                disabled={!editable}
                translate={translate}
                onToggle={() => dispatch({ kind: "toggleProblems" })}
                onShow={showProblem}
                onFix={(problem) => problem.fix && onEdit(problem.fix.edits)}
            />
        </div>
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
