import { ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { MarketplaceListing, UnreadableMarketplaces } from "../../kernel/domain/marketplaceListing";
import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { ProjectScope } from "../../kernel/domain/projectScopes";
import { ListedTemplate, TemplateFileListing } from "../../kernel/domain/templateListing";
import {
    isTemplateOffered,
    isTemplateSourceEnabled,
    TemplatePreferencesByScope,
    TemplateSourceRef,
    TemplateSwitch,
    templateSwitchOf,
} from "../../kernel/domain/templatePreferences";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import type {
    ActionView,
    AddOnGroupView,
    AddOnSourceView,
    TemplateAddOnView,
} from "./addOnCatalogModel";
import {
    MARKETPLACES_GROUP_ID,
    SourceActionKind,
    sourceIdOf,
    templateAddOnIdOf,
    TemplateActionKind,
    TemplateSourceActionKind,
    TemplateState,
} from "./addOnIds";
import {
    ACTION_LABEL,
    ADD_ON_KIND_TEXT,
    cannotBeReadText,
    MARKETPLACES_GROUP_TEXT,
    TEMPLATE_SOURCE_DISABLED_NOTE,
    TEMPLATE_STATE_TEXT,
    TEMPLATES_DISABLED_TEXT,
    templateVersionText,
} from "./addOnTexts";
import { byKindThenName, optional } from "./addOnViewParts";

/** One registered marketplace as its owner listed and worded it, with its cached templates read. */
export type ListedMarketplace = Omit<MarketplaceListing, "templateFiles"> & {
    readonly templates: readonly TemplateFileListing[];
};

/** The registered marketplaces, or why their owner could not read them. */
export type ListedMarketplaces =
    | { readonly kind: "listed"; readonly sources: readonly ListedMarketplace[] }
    | UnreadableMarketplaces;

/** What the core showed of one source that offers an action; kept by the core and never sent. */
export type ShownSource =
    | {
          readonly kind: "marketplace";
          readonly label: string;
          readonly entry: MarketplaceSettingsEntry;
          readonly templateSource?: TemplateSourceRef;
          readonly actions: readonly SourceActionKind[];
      }
    | {
          readonly kind: "configFolder";
          readonly label: string;
          readonly templateSource: TemplateSourceRef;
          readonly actions: readonly SourceActionKind[];
      };

/** What the core showed of one template's switch; kept by the core and never sent. */
export interface ShownTemplate {
    readonly name: string;
    readonly switch: TemplateSwitch;
    readonly scope: ProjectScope;
    readonly actions: readonly TemplateActionKind[];
}

export interface TemplateRow {
    readonly view: TemplateAddOnView;
    /** Only for a template that offers a switch. */
    readonly shown?: ShownTemplate;
}

/** Where a source's switches live and what the user switched; absent on a host that keeps none. */
export interface TemplateSwitches {
    readonly source: TemplateSourceRef;
    readonly preferences: TemplatePreferencesByScope;
}

/** A source's templates switch as a view shows it. */
export interface SourceSwitchView {
    readonly actions: readonly ActionView<TemplateSourceActionKind>[];
    readonly stateText?: string;
}

interface SwitchState {
    readonly state: TemplateState;
    readonly actions: readonly ActionView<TemplateActionKind>[];
    readonly note?: string;
}

const NO_SWITCH: SwitchState = { state: "enabled", actions: [] };

/** By whether its source is on, then whether its own switch is on. */
const TEMPLATE_SWITCH_STATE: Record<"on" | "off", Record<"on" | "off", SwitchState>> = {
    on: {
        on: { state: "enabled", actions: [{ kind: "disable", label: ACTION_LABEL.disable }] },
        off: { state: "disabled", actions: [{ kind: "enable", label: ACTION_LABEL.enable }] },
    },
    off: {
        on: { state: "disabled", actions: [], note: TEMPLATE_SOURCE_DISABLED_NOTE },
        off: { state: "disabled", actions: [], note: TEMPLATE_SOURCE_DISABLED_NOTE },
    },
};

const SOURCE_SWITCH_VIEW: Record<"on" | "off", SourceSwitchView> = {
    on: { actions: [{ kind: "disableTemplates", label: ACTION_LABEL.disableTemplates }] },
    off: {
        actions: [{ kind: "enableTemplates", label: ACTION_LABEL.enableTemplates }],
        stateText: TEMPLATES_DISABLED_TEXT,
    },
};

const MARKETPLACE_SOURCE_ACTIONS: readonly ActionView<SourceActionKind>[] = [
    { kind: "removeMarketplace", label: ACTION_LABEL.removeMarketplace },
];

const onOff = (on: boolean): "on" | "off" => (on ? "on" : "off");

/** Each template of a file, or the file once when it cannot be read; a blank file holds none. */
export function templateRowsOf(
    sourceId: string,
    { path, reading }: TemplateFileListing,
    switches?: TemplateSwitches,
): TemplateRow[] {
    const fileName = lastWorkspacePathSegment(path);
    if (reading.kind === "unreadable") {
        return [
            {
                view: {
                    ...templateView(templateAddOnIdOf(sourceId, path), fileName, NO_SWITCH),
                    problem: cannotBeReadText(reading.reason),
                },
            },
        ];
    }
    return reading.templates.map((template, index) => {
        const name = template.name ?? template.id ?? fileName;
        const switchState = switchStateOf(template.id, switches);
        return {
            view: {
                ...templateView(
                    templateAddOnIdOf(sourceId, path, template, index),
                    name,
                    switchState,
                ),
                ...templateDetailsOf(template),
            },
            ...optional("shown", shownTemplateOf(name, template.id, switchState, switches)),
        };
    });
}

/** A source's switch, offered once it holds a template the switch can hide. */
export function sourceSwitchViewOf({ source, preferences }: TemplateSwitches): SourceSwitchView {
    return SOURCE_SWITCH_VIEW[onOff(isTemplateSourceEnabled(source, preferences))];
}

export function marketplaceSourceOf(
    marketplace: ListedMarketplace,
    preferences: TemplatePreferencesByScope | undefined,
): {
    readonly view: AddOnSourceView;
    readonly shown: ShownSource;
    readonly templates: readonly TemplateRow[];
} {
    const id = sourceIdOf("marketplace", marketplace.id);
    const switches =
        marketplace.templateSource && preferences
            ? { source: marketplace.templateSource, preferences }
            : undefined;
    const sourceSwitch = switches && sourceSwitchViewOf(switches);
    const actions = [...MARKETPLACE_SOURCE_ACTIONS, ...(sourceSwitch?.actions ?? [])];
    const templates = marketplace.templates.flatMap((listing) =>
        templateRowsOf(id, listing, switches),
    );
    return {
        view: {
            id,
            kind: "marketplace",
            label: marketplace.label,
            description: marketplace.scopeText,
            ...optional("problem", marketplace.problem),
            ...optional("stateText", sourceSwitch?.stateText),
            actions,
            addOns: templates.map(({ view }) => view).sort(byKindThenName),
        },
        shown: {
            kind: "marketplace",
            label: marketplace.label,
            entry: marketplace.entry,
            ...optional("templateSource", switches?.source),
            actions: actions.map(({ kind }) => kind),
        },
        templates,
    };
}

export function marketplacesGroupOf(
    sources: readonly AddOnSourceView[],
    problem: string | undefined,
): AddOnGroupView[] {
    return sources.length === 0 && problem === undefined
        ? []
        : [
              {
                  id: MARKETPLACES_GROUP_ID,
                  ...MARKETPLACES_GROUP_TEXT,
                  ...optional("problem", problem),
                  sources,
              },
          ];
}

/** A template without an id cannot be told apart by the page, so it offers no switch. */
function switchStateOf(templateId: string | undefined, switches?: TemplateSwitches): SwitchState {
    if (templateId === undefined || switches === undefined) {
        return NO_SWITCH;
    }
    const { source, preferences } = switches;
    return TEMPLATE_SWITCH_STATE[onOff(isTemplateSourceEnabled(source, preferences))][
        onOff(isTemplateOffered(templateId, source, preferences))
    ];
}

function shownTemplateOf(
    name: string,
    templateId: string | undefined,
    { actions }: SwitchState,
    switches?: TemplateSwitches,
): ShownTemplate | undefined {
    if (templateId === undefined || switches === undefined) {
        return undefined;
    }
    return {
        name,
        switch: templateSwitchOf(switches.source, templateId),
        scope: switches.source.scope,
        actions: actions.map(({ kind }) => kind),
    };
}

function templateView(
    id: string,
    name: string,
    { state, actions, note }: SwitchState,
): TemplateAddOnView {
    return {
        id,
        kind: "elementTemplate",
        kindText: ADD_ON_KIND_TEXT.elementTemplate,
        name,
        state,
        stateText: TEMPLATE_STATE_TEXT[state],
        ...optional("note", note),
        actions,
    };
}

function templateDetailsOf(
    template: ListedTemplate,
): Pick<TemplateAddOnView, "detail" | "engineText"> {
    return {
        ...optional(
            "detail",
            template.version === undefined ? undefined : templateVersionText(template.version),
        ),
        ...optional(
            "engineText",
            template.engine === undefined ? undefined : ENGINE_LABEL[template.engine],
        ),
    };
}
