import { ApprovableArtifact, ReviewedAllow } from "../../kernel/domain/codeApproval";
import { ShownCode } from "./addOnCatalog";
import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { ProjectScope } from "../../kernel/domain/projectScopes";
import {
    sourceSwitchOf,
    templatePreferenceChange,
    TemplatePreferenceChange,
    TemplateSwitch,
} from "../../kernel/domain/templatePreferences";
import { ShownSource, ShownTemplate } from "./templateAddOnViews";
import {
    AddOnActionKind,
    CatalogActionKind,
    SourceActionKind,
    TemplateActionKind,
    TemplateSourceActionKind,
} from "./addOnIds";
import { ShownRevisions } from "./shownRevisions";

/** What a view asks of the core; every id names something the core itself showed. */
export type AddOnRequest =
    | { readonly kind: "inspect"; readonly addOnId: string }
    | { readonly kind: "allow"; readonly addOnId: string; readonly revision: number }
    | { readonly kind: "revoke"; readonly addOnId: string }
    | { readonly kind: TemplateActionKind; readonly addOnId: string }
    | { readonly kind: "removeMarketplace"; readonly sourceId: string }
    | { readonly kind: TemplateSourceActionKind; readonly sourceId: string }
    | { readonly kind: "addMarketplace" }
    | { readonly kind: "updateMarketplaces" }
    | { readonly kind: "pruneCache" }
    | { readonly kind: "refresh" };

export type AddOnRefusal =
    | "unknownAddOn"
    | "unknownSource"
    | "staleView"
    | "closedView"
    | "notOffered"
    | Extract<ReviewedAllow, { kind: "refused" }>["reason"];

export type AddOnActionResult =
    | { readonly kind: "done"; readonly message?: string }
    | { readonly kind: "refused"; readonly reason: AddOnRefusal; readonly message: string }
    | { readonly kind: "failed"; readonly message: string }
    /** The marketplace flow asked and reported on its own. */
    | { readonly kind: "reportedByFlow" };

export type AllowTarget =
    | { readonly kind: "reviewed"; readonly code: ShownCode; readonly content: ApprovableArtifact }
    | { readonly kind: "refused"; readonly result: AddOnActionResult };

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

export type ShownTarget =
    | { readonly kind: "shown"; readonly code: ShownCode }
    | { readonly kind: "refused"; readonly result: AddOnActionResult };

const STALE_VIEW = refused(
    "staleView",
    "The list changed since you looked at it. Check it again, then allow.",
);
const UNKNOWN_ADD_ON = refused("unknownAddOn", "This add-on is no longer listed.");
const NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action for this add-on now. Check it again.",
);
export const CLOSED_VIEW = refused("closedView", "This view is closed.");
const UNKNOWN_SOURCE = refused("unknownSource", "This source is no longer listed.");
const SOURCE_NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action for this source now. Check it again.",
);
export const CATALOG_NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action now. Check it again.",
);

export const REPORTED_BY_FLOW: AddOnActionResult = { kind: "reportedByFlow" };

const REFUSED_ALLOW_TEXT: Record<
    Extract<ReviewedAllow, { kind: "refused" }>["reason"],
    (name: string) => string
> = {
    changedSinceReview: (name) =>
        `${name} changed after you reviewed it. Review it again, then allow.`,
    gone: (name) => `${name} is gone.`,
    unreadable: (name) => `${name} can no longer be read.`,
};

/** Only the content the named revision showed can be allowed, whatever is listed now. */
export function allowTargetOf(
    revisions: ShownRevisions,
    revision: number,
    addOnId: string,
): AllowTarget {
    const shown = revisions.shownAt(revision);
    if (shown === undefined) {
        return { kind: "refused", result: STALE_VIEW };
    }
    const target = offeredTargetOf(shown, addOnId, "allow");
    if (target.kind === "refused") {
        return target;
    }
    const { code } = target;
    return code.content === undefined
        ? { kind: "refused", result: STALE_VIEW }
        : { kind: "reviewed", code, content: code.content };
}

/** Only an action the latest revision offered for the add-on. */
export function shownTargetOf(
    revisions: ShownRevisions,
    addOnId: string,
    action: Extract<AddOnActionKind, "inspect" | "revoke">,
): ShownTarget {
    return offeredTargetOf(revisions.latest(), addOnId, action);
}

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

/** Why a catalog action the latest build did not offer is refused; `undefined` when it offered it. */
export function catalogActionRefusalOf(
    offered: readonly CatalogActionKind[],
    action: CatalogActionKind,
): AddOnActionResult | undefined {
    return offered.includes(action) ? undefined : CATALOG_NOT_OFFERED;
}

function offeredTargetOf(
    shown: ReadonlyMap<string, ShownCode>,
    addOnId: string,
    action: AddOnActionKind,
): ShownTarget {
    const code = shown.get(addOnId);
    if (code === undefined) {
        return { kind: "refused", result: UNKNOWN_ADD_ON };
    }
    return code.actions.includes(action)
        ? { kind: "shown", code }
        : { kind: "refused", result: NOT_OFFERED };
}

export function allowResultOf(code: ShownCode, decision: ReviewedAllow): AddOnActionResult {
    if (decision.kind === "refused") {
        return refused(decision.reason, REFUSED_ALLOW_TEXT[decision.reason](code.name));
    }
    return { kind: "done", message: `Allowed ${code.name}. ${code.allowedFollowUp}` };
}

export function revokeResultOf(code: ShownCode): AddOnActionResult {
    return { kind: "done", message: `Revoked ${code.name}. ${code.revokedFollowUp}` };
}

export function inspectResultOf(code: ShownCode): AddOnActionResult {
    return {
        kind: "done",
        message: `Read ${code.name}. Review what it covers, then allow this content.`,
    };
}

export const PRUNE_FAILED: AddOnActionResult = {
    kind: "failed",
    message: "Could not remove the unused plugin copies. The log says why.",
};

export function pruneResultOf(removed: number): AddOnActionResult {
    const message =
        removed === 0
            ? "No unused plugin copies to remove."
            : `Removed ${removed} unused plugin ${removed === 1 ? "copy" : "copies"}.`;
    return { kind: "done", message };
}

function refused(reason: AddOnRefusal, message: string): AddOnActionResult {
    return { kind: "refused", reason, message };
}
