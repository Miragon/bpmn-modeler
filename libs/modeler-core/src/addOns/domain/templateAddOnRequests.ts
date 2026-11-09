import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { ProjectScope } from "../../kernel/domain/projectScopes";
import {
    sourceSwitchOf,
    templatePreferenceChange,
    TemplatePreferenceChange,
    TemplateSwitch,
} from "../../kernel/domain/templatePreferences";
import { SourceActionKind, TemplateActionKind, TemplateSourceActionKind } from "./addOnIds";
import { AddOnActionResult, NOT_OFFERED, refused, UNKNOWN_ADD_ON } from "./addOnRequests";
import { ShownSource, ShownTemplate } from "./templateAddOnViews";

export type MarketplaceRemovalTarget =
    | { readonly kind: "shown"; readonly entry: MarketplaceSettingsEntry }
    | { readonly kind: "refused"; readonly result: AddOnActionResult };

/** The one write a switch action makes, and what to say once it is stored. */
export type TemplateSwitchTarget =
    | {
          readonly kind: "switch";
          readonly change: TemplatePreferenceChange;
          readonly result: AddOnActionResult;
      }
    | { readonly kind: "refused"; readonly result: AddOnActionResult };

const UNKNOWN_SOURCE = refused("unknownSource", "This source is no longer listed.");
const SOURCE_NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action for this source now. Check it again.",
);

/** Only a removal the latest build offered, of the entry it showed for the marketplace. */
export function marketplaceRemovalTargetOf(
    sources: ReadonlyMap<string, ShownSource>,
    sourceId: string,
): MarketplaceRemovalTarget {
    const offered = offeredSourceOf(sources, sourceId, "removeMarketplace");
    if (offered.kind === "refused") {
        return offered;
    }
    return offered.source.kind === "marketplace"
        ? { kind: "shown", entry: offered.source.entry }
        : { kind: "refused", result: SOURCE_NOT_OFFERED };
}

/** Only a switch the latest build offered for the source, written where its switches live. */
export function sourceSwitchTargetOf(
    sources: ReadonlyMap<string, ShownSource>,
    sourceId: string,
    action: TemplateSourceActionKind,
): TemplateSwitchTarget {
    const offered = offeredSourceOf(sources, sourceId, action);
    if (offered.kind === "refused") {
        return offered;
    }
    const { label, templateSource } = offered.source;
    if (templateSource === undefined) {
        return { kind: "refused", result: SOURCE_NOT_OFFERED };
    }
    return {
        kind: "switch",
        change: SWITCH_CHANGE[SOURCE_SWITCH_DIRECTION[action]](
            templateSource.scope,
            sourceSwitchOf(templateSource),
        ),
        result: { kind: "done", message: SOURCE_SWITCH_RESULT_TEXT[action](label) },
    };
}

/** Only a switch the latest build offered for the template, written in its source's scope. */
export function templateSwitchTargetOf(
    templates: ReadonlyMap<string, ShownTemplate>,
    addOnId: string,
    action: TemplateActionKind,
): TemplateSwitchTarget {
    const template = templates.get(addOnId);
    if (template === undefined) {
        return { kind: "refused", result: UNKNOWN_ADD_ON };
    }
    if (!template.actions.includes(action)) {
        return { kind: "refused", result: NOT_OFFERED };
    }
    return {
        kind: "switch",
        change: SWITCH_CHANGE[action](template.scope, template.switch),
        result: { kind: "done", message: TEMPLATE_SWITCH_RESULT_TEXT[action](template.name) },
    };
}

export const TEMPLATE_SWITCH_FAILED: AddOnActionResult = {
    kind: "failed",
    message: "Could not save this choice. The log says why.",
};

const SWITCH_CHANGE: Record<
    TemplateActionKind,
    (scope: ProjectScope, each: TemplateSwitch) => TemplatePreferenceChange
> = {
    disable: (scope, each) => templatePreferenceChange(scope, [each], []),
    enable: (scope, each) => templatePreferenceChange(scope, [], [each]),
};

const SOURCE_SWITCH_DIRECTION: Record<TemplateSourceActionKind, TemplateActionKind> = {
    disableTemplates: "disable",
    enableTemplates: "enable",
};

const TEMPLATE_SWITCH_RESULT_TEXT: Record<TemplateActionKind, (name: string) => string> = {
    disable: (name) =>
        `Disabled ${name}. New elements no longer offer it; elements that use it keep it.`,
    enable: (name) => `Enabled ${name}.`,
};

const SOURCE_SWITCH_RESULT_TEXT: Record<TemplateSourceActionKind, (label: string) => string> = {
    disableTemplates: (label) =>
        `Disabled the templates of ${label}. New elements no longer offer them; elements that use them keep them.`,
    enableTemplates: (label) => `Enabled the templates of ${label}.`,
};

function offeredSourceOf(
    sources: ReadonlyMap<string, ShownSource>,
    sourceId: string,
    action: SourceActionKind,
):
    | { readonly kind: "shown"; readonly source: ShownSource }
    | { readonly kind: "refused"; readonly result: AddOnActionResult } {
    const source = sources.get(sourceId);
    if (source === undefined) {
        return { kind: "refused", result: UNKNOWN_SOURCE };
    }
    return source.actions.includes(action)
        ? { kind: "shown", source }
        : { kind: "refused", result: SOURCE_NOT_OFFERED };
}
