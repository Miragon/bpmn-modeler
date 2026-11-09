import { ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { MarketplaceListing, UnreadableMarketplaces } from "../../kernel/domain/marketplaceListing";
import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { TemplateFileListing } from "../../kernel/domain/templateListing";
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
    TemplateState,
} from "./addOnIds";
import {
    ACTION_LABEL,
    ADD_ON_KIND_TEXT,
    cannotBeReadText,
    MARKETPLACES_GROUP_TEXT,
    TEMPLATE_STATE_TEXT,
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

/** What the core showed of one marketplace source; kept by the core and never sent. */
export interface ShownSource {
    readonly entry: MarketplaceSettingsEntry;
    readonly actions: readonly SourceActionKind[];
}

const MARKETPLACE_SOURCE_ACTIONS: readonly ActionView<SourceActionKind>[] = [
    { kind: "removeMarketplace", label: ACTION_LABEL.removeMarketplace },
];

const TEMPLATE_STATE: TemplateState = "enabled";

/** Each template of a file, or the file once when it cannot be read; a blank file holds none. */
export function templateViewsOf(
    sourceId: string,
    { path, reading }: TemplateFileListing,
): TemplateAddOnView[] {
    const fileName = lastWorkspacePathSegment(path);
    if (reading.kind === "unreadable") {
        return [
            {
                ...templateViewBase(templateAddOnIdOf(sourceId, path), fileName),
                problem: cannotBeReadText(reading.reason),
            },
        ];
    }
    return reading.templates.map((template, index) => ({
        ...templateViewBase(
            templateAddOnIdOf(sourceId, path, template, index),
            template.name ?? template.id ?? fileName,
        ),
        ...optional(
            "detail",
            template.version === undefined ? undefined : templateVersionText(template.version),
        ),
        ...optional(
            "engineText",
            template.engine === undefined ? undefined : ENGINE_LABEL[template.engine],
        ),
    }));
}

function templateViewBase(id: string, name: string): TemplateAddOnView {
    return {
        id,
        kind: "elementTemplate",
        kindText: ADD_ON_KIND_TEXT.elementTemplate,
        name,
        state: TEMPLATE_STATE,
        stateText: TEMPLATE_STATE_TEXT[TEMPLATE_STATE],
        actions: [],
    };
}

export function marketplaceSourceOf(marketplace: ListedMarketplace): {
    readonly view: AddOnSourceView;
    readonly shown: ShownSource;
} {
    const id = sourceIdOf("marketplace", marketplace.id);
    return {
        view: {
            id,
            kind: "marketplace",
            label: marketplace.label,
            description: marketplace.scopeText,
            ...optional("problem", marketplace.problem),
            actions: MARKETPLACE_SOURCE_ACTIONS,
            addOns: marketplace.templates
                .flatMap((listing) => templateViewsOf(id, listing))
                .sort(byKindThenName),
        },
        shown: {
            entry: marketplace.entry,
            actions: MARKETPLACE_SOURCE_ACTIONS.map(({ kind }) => kind),
        },
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
