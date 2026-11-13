import type {
    AddOnActionResultPayload,
    AddOnCatalogPayload,
    AddOnPayload,
    AddOnRequestPayload,
    AddOnRevealPayload,
} from "@miragon/bpmn-modeler-shared";

import { ActionKindPayload, actionRequestOf, isActionKind } from "./actionRequest";
import {
    AddOnKind,
    CatalogFilter,
    filteredGroups,
    isFilterActive,
    needsReview,
    NO_FILTER,
    withKindToggled,
} from "./catalogFilter";
import { addOnsOf, placementOf, sourceOf } from "./catalogQueries";
import { settledSelection } from "./catalogSelection";
import {
    ancestorsOf,
    Expansion,
    headsOf,
    isReviewKeyOpen,
    isShownOpen,
    ListExpansion,
    prunedExpansion,
    reviewKeyOf,
    rowsInSight,
} from "./expansion";
import { focusAfterDone, FocusTarget, isFocusable, isListed } from "./focusAfter";
import { displayOrderOf, needsAttention, sectionGroupsOf, sectionsOf } from "./listSections";
import { placedActions, reviewOf } from "./placedActions";
import { Banner, resultBannerOf } from "./resultBanner";

interface PendingRequest {
    readonly targetId: string;
    readonly actionKind: ActionKindPayload;
    readonly slot: number;
}

/** Which pane a narrow view shows; a wide one shows both. */
type Pane = "list" | "detail";

export interface ViewState {
    readonly model?: AddOnCatalogPayload;
    readonly expansion: Expansion;
    /** What the user opened or closed while a filter is on: kept with the page, and only while the filter stays on. */
    readonly filterExpansion: Expansion;
    readonly selectedId?: string;
    readonly filter: CatalogFilter;
    readonly pane: Pane;
    readonly pending: ReadonlyMap<number, PendingRequest>;
    readonly banner?: Banner;
    readonly reveal?: AddOnRevealPayload;
    readonly lastRevealId: number;
    readonly awaitingFocus?: FocusTarget;
    readonly nextRequestId: number;
    /** What Review Add-ons found, for a screen reader, until the user searches or filters. */
    readonly reviewCount?: number;
}

/**
 * What the view keeps across a reload of its page: the user's own choices,
 * never a request. The search and the filter stay with the page.
 */
export interface PersistedChoices {
    readonly expansion?: readonly (readonly [string, boolean])[];
    readonly selectedId?: string;
    /** An older page kept a selection per scope; its workspace one carries over once. */
    readonly selection?: { readonly workspace?: unknown };
    readonly lastRevealId?: number;
}

export type ViewEvent =
    | { readonly kind: "modelArrived"; readonly model: AddOnCatalogPayload }
    | { readonly kind: "revealArrived"; readonly reveal: AddOnRevealPayload }
    | { readonly kind: "actionChosen"; readonly actionKind: string; readonly targetId?: string }
    | {
          readonly kind: "resultArrived";
          readonly requestId: number;
          readonly result: AddOnActionResultPayload;
      }
    | { readonly kind: "toggled"; readonly key: string }
    | { readonly kind: "bannerDismissed" }
    | { readonly kind: "addOnSelected"; readonly addOnId: string }
    | { readonly kind: "backChosen" }
    | { readonly kind: "queryChanged"; readonly query: string }
    | { readonly kind: "kindToggled"; readonly addOnKind: AddOnKind }
    | { readonly kind: "filtersCleared" };

export interface Transition {
    readonly state: ViewState;
    readonly send?: { readonly requestId: number; readonly request: AddOnRequestPayload };
    readonly focus?: FocusTarget;
}

/** Busy rows and sources, and the catalog actions under {@link CATALOG_TARGET}. */
export const CATALOG_TARGET = "catalog";

export function initialViewState(persisted?: PersistedChoices): ViewState {
    const selectedId = selectedIdIn(persisted);
    return {
        expansion: new Map(persisted?.expansion ?? []),
        filterExpansion: new Map(),
        ...(selectedId !== undefined && { selectedId }),
        filter: NO_FILTER,
        pane: "list",
        pending: new Map(),
        lastRevealId: persisted?.lastRevealId ?? 0,
        nextRequestId: 1,
    };
}

export function persistedChoicesOf(state: ViewState): PersistedChoices {
    return {
        expansion: [...state.expansion],
        ...(state.selectedId !== undefined && { selectedId: state.selectedId }),
        lastRevealId: state.lastRevealId,
    };
}

export function isBusy(state: ViewState, targetId: string): boolean {
    return [...state.pending.values()].some((each) => each.targetId === targetId);
}

export function selectedIdOf(state: ViewState): string | undefined {
    return state.selectedId;
}

export function listExpansionOf(state: ViewState): ListExpansion {
    return {
        expansion: state.expansion,
        filterExpansion: state.filterExpansion,
        filterActive: isFilterActive(state.filter),
    };
}

/**
 * The view's one decision: what an event from the host or the user changes,
 * what to ask the host, which add-on the list selects and where focus goes.
 * Focus is only named once the model holds its target.
 */
export function nextViewState(state: ViewState, event: ViewEvent): Transition {
    const change = withSelection(withFilterExpansionEnded(changedBy(state, event)), state);
    return withFocus(change, change.state.model !== state.model);
}

type Change = {
    readonly state: ViewState;
    readonly send?: Transition["send"];
    readonly focus?: FocusTarget;
};

function changedBy(state: ViewState, event: ViewEvent): Change {
    switch (event.kind) {
        case "modelArrived":
            return modelArrived(state, event.model);
        case "revealArrived":
            return event.reveal.revealId <= state.lastRevealId
                ? { state }
                : revealed({ ...state, reveal: event.reveal });
        case "actionChosen":
            return actionChosen(state, event.actionKind, event.targetId);
        case "resultArrived":
            return resultArrived(state, event.requestId, event.result);
        case "toggled":
            return toggled(state, event.key);
        case "bannerDismissed":
            return { state: { ...state, banner: undefined } };
        case "addOnSelected":
            return { state: { ...state, selectedId: event.addOnId, pane: "detail" } };
        case "backChosen":
            return { state: { ...state, pane: "list" } };
        case "queryChanged":
            return filtered(state, { ...state.filter, query: event.query });
        case "kindToggled":
            return filtered(state, withKindToggled(state.filter, event.addOnKind));
        case "filtersCleared":
            return filtered(state, NO_FILTER);
    }
}

/** A search or filter speaks for itself, so what Review Add-ons found stops being said; so does an action. */
function filtered(state: ViewState, filter: CatalogFilter): Change {
    return { state: { ...unsaid(state), filter } };
}

function unsaid(state: ViewState): ViewState {
    const { reviewCount: _said, ...rest } = state;
    return rest;
}

function modelArrived(state: ViewState, model: AddOnCatalogPayload): Change {
    if (state.model !== undefined && model.revision < state.model.revision) return { state };
    return revealed({
        ...state,
        model,
        expansion: prunedExpansion(model, state.expansion),
    });
}

/** Applies a waiting reveal once a model arrived. */
function revealed(state: ViewState): Change {
    const { reveal, model } = state;
    if (reveal === undefined || model === undefined) return { state };
    switch (reveal.kind) {
        case "rows":
            return rowsRevealed(state, model, reveal);
        case "needsReview":
            return reviewRevealed(state, model, reveal.revealId);
    }
}

/**
 * Lands on the first of the rows a "Review…" left, as the list orders them, once the
 * model holds one: its open review and its detail, past any filter that hid
 * it. A row Needs attention lists sits under no header, so none opens for it.
 */
function rowsRevealed(
    state: ViewState,
    model: AddOnCatalogPayload,
    reveal: Extract<AddOnRevealPayload, { kind: "rows" }>,
): Change {
    const heads = headsOf(model);
    const ordered = shownListOf(model, { ...state, filter: NO_FILTER }).addOns;
    const addOn = ordered.find(({ id }) => reveal.addOnIds.includes(id));
    if (addOn === undefined) return { state };
    const expansion = new Map(state.expansion);
    const filterExpansion = new Map(state.filterExpansion);
    if (!needsAttention(addOn)) {
        ancestorsOf(heads, addOn.id).forEach((id) => {
            expansion.set(id, true);
            filterExpansion.set(id, true);
        });
    }
    if (reviewOf(addOn) !== undefined) expansion.set(reviewKeyOf(addOn.id), true);
    const shown = filteredGroups(model, state.filter);
    const filter = placementOf(shown, addOn.id) === undefined ? NO_FILTER : state.filter;
    return {
        state: {
            ...state,
            reveal: undefined,
            expansion,
            filterExpansion,
            filter,
            selectedId: addOn.id,
            pane: "detail",
            lastRevealId: reveal.revealId,
        },
        focus: { kind: "head", headId: addOn.id, reveal: true },
    };
}

/**
 * Review Add-ons: the whole list, unfiltered, with an add-on that waits for a
 * review selected and focused: the selected one if it waits, else the first
 * of Needs attention that does. A row whose problem keeps Allow away is
 * passed over; when nothing waits, the selection stays.
 */
function reviewRevealed(state: ViewState, model: AddOnCatalogPayload, revealId: number): Change {
    const waiting = sectionsOf(model.groups)
        .attention.map(({ addOn }) => addOn)
        .filter(needsReview);
    const kept = waiting.find(({ id }) => id === state.selectedId);
    const selected = (kept ?? waiting[0])?.id;
    return {
        state: {
            ...state,
            ...(selected !== undefined && { selectedId: selected }),
            reveal: undefined,
            filter: NO_FILTER,
            filterExpansion: new Map(),
            pane: "list",
            lastRevealId: revealId,
            reviewCount: waiting.length,
        },
        focus:
            selected === undefined
                ? { kind: "listStart", requested: true }
                : { kind: "head", headId: selected, requested: true },
    };
}

function actionChosen(state: ViewState, actionKind: string, targetId: string | undefined): Change {
    const { model } = state;
    if (model === undefined || !isActionKind(actionKind)) return { state };
    const target = targetId ?? CATALOG_TARGET;
    const slot = offeredSlotOf(model, actionKind, targetId);
    if (slot === undefined || isBusy(state, target)) return { state };
    const requestId = state.nextRequestId;
    const pending = new Map(state.pending).set(requestId, { targetId: target, actionKind, slot });
    return {
        state: { ...unsaid(state), banner: undefined, pending, nextRequestId: requestId + 1 },
        send: { requestId, request: actionRequestOf(actionKind, target, model.revision) },
    };
}

/** Where the model offers the action, read from the model and never from the page's markup. */
function offeredSlotOf(
    model: AddOnCatalogPayload,
    actionKind: ActionKindPayload,
    targetId: string | undefined,
): number | undefined {
    const at = (actions: readonly { readonly kind: string }[]) => {
        const index = actions.findIndex(({ kind }) => kind === actionKind);
        return index === -1 ? undefined : index;
    };
    if (targetId === undefined) return at(model.actions);
    const source = sourceOf(model.groups, targetId);
    if (source !== undefined) return at(source.actions);
    const addOn = placementOf(model.groups, targetId)?.addOn;
    if (addOn === undefined) return undefined;
    const placed = placedActions(addOn);
    return placed.allow?.kind === actionKind ? 0 : at(placed.rowLine);
}

function resultArrived(
    state: ViewState,
    requestId: number,
    result: AddOnActionResultPayload,
): Change {
    const request = state.pending.get(requestId);
    if (request === undefined) return { state };
    const pending = new Map(state.pending);
    pending.delete(requestId);
    const awaitingFocus =
        result.kind === "done"
            ? focusAfterDone(request.actionKind, request.targetId, request.slot)
            : state.awaitingFocus;
    return { state: { ...state, pending, banner: resultBannerOf(result), awaitingFocus } };
}

/** A head toggled while a filter is on changes only the filter's own choices; a review keeps its choice in either case. */
function toggled(state: ViewState, key: string): Change {
    const { model } = state;
    if (model === undefined) return { state };
    const head = headsOf(model).find(({ id }) => id === key);
    if (head === undefined) {
        const open = isReviewKeyOpen(key, state.expansion);
        return { state: { ...state, expansion: new Map(state.expansion).set(key, !open) } };
    }
    const shown = listExpansionOf(state);
    const open = isShownOpen(head, shown);
    return shown.filterActive
        ? { state: { ...state, filterExpansion: new Map(state.filterExpansion).set(key, !open) } }
        : { state: { ...state, expansion: new Map(state.expansion).set(key, !open) } };
}

/** What the user opened or closed over a filter's matches ends with the filter, so their own layout shows again. */
function withFilterExpansionEnded(change: Change): Change {
    const { state } = change;
    if (isFilterActive(state.filter) || state.filterExpansion.size === 0) return change;
    return { ...change, state: { ...state, filterExpansion: new Map() } };
}

function shownSectionsOf(model: AddOnCatalogPayload, filter: CatalogFilter) {
    return sectionsOf(filteredGroups(model, filter), {
        filtering: isFilterActive(filter),
        all: model.groups,
    });
}

/** The rows the list shows, in its order, and those its open headers leave in sight. */
interface ShownList {
    readonly addOns: readonly AddOnPayload[];
    readonly inSight: ReadonlySet<string>;
}

/** Needs attention sits under no header, so its rows are always in sight. */
function shownListOf(model: AddOnCatalogPayload, state: ViewState): ShownList {
    const sections = shownSectionsOf(model, state.filter);
    const attention = sections.attention.map(({ addOn }) => addOn);
    const below = sectionGroupsOf(sections);
    const underHeads = rowsInSight(below, listExpansionOf(state), sections.flatGroupIds);
    return {
        addOns: [...attention, ...addOnsOf(below)],
        inSight: new Set([...attention.map(({ id }) => id), ...underHeads]),
    };
}

/**
 * Settles the selection after the list changed, by the order the list shows.
 * A narrow view that showed the detail of an add-on the list lost goes back
 * to the list.
 */
function withSelection(change: Change, before: ViewState): Change {
    const { state } = change;
    const { model } = state;
    if (model === undefined) return change;
    const shown = shownListOf(model, state);
    const orderBefore =
        before.model === undefined
            ? []
            : displayOrderOf(shownSectionsOf(before.model, before.filter));
    const remembered = state.selectedId;
    const selected = settledSelection(remembered, shown.addOns, orderBefore, shown.inSight);
    if (selected === remembered) return change;
    const { selectedId: _dropped, ...rest } = state;
    const pane = remembered === undefined ? state.pane : "list";
    return {
        ...change,
        state: { ...rest, ...(selected !== undefined && { selectedId: selected }), pane },
    };
}

/**
 * Names a waiting focus target as the transition's focus once the model holds
 * it. A model without it ends the wait: focus goes to what is left of its
 * add-on or source, else to the list's selection.
 */
function withFocus(change: Change, modelChanged: boolean): Transition {
    const { state } = change;
    const waiting = state.awaitingFocus;
    const model = state.model;
    if (change.focus !== undefined || waiting === undefined || model === undefined) {
        return change;
    }
    const focus = isFocusable(waiting, model)
        ? waiting
        : modelChanged
          ? fallbackFocus(waiting, state, model)
          : undefined;
    if (focus === undefined && !modelChanged) return change;
    return { ...change, state: { ...state, awaitingFocus: undefined }, focus };
}

function fallbackFocus(
    target: FocusTarget,
    state: ViewState,
    model: AddOnCatalogPayload,
): FocusTarget | undefined {
    const ownerId = target.kind === "action" ? target.targetId : undefined;
    if (ownerId !== undefined && isListed(model, ownerId)) return { kind: "head", headId: ownerId };
    const selected = selectedIdOf(state);
    return selected === undefined ? undefined : { kind: "head", headId: selected };
}

function selectedIdIn(persisted: PersistedChoices | undefined): string | undefined {
    const kept: unknown = persisted?.selectedId;
    if (typeof kept === "string") return kept;
    const older: unknown =
        typeof persisted?.selection === "object" && persisted.selection !== null
            ? persisted.selection.workspace
            : undefined;
    return typeof older === "string" ? older : undefined;
}
