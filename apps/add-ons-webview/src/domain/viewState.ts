import type {
    AddOnActionResultPayload,
    AddOnCatalogPayload,
    AddOnRequestPayload,
    AddOnRevealPayload,
} from "@miragon/bpmn-modeler-shared";

import { ActionKindPayload, actionRequestOf, isActionKind } from "./actionRequest";
import {
    AddOnKind,
    CatalogFilter,
    filteredGroups,
    isFilterActive,
    NEEDS_REVIEW_ONLY,
    NO_FILTER,
    withKindToggled,
} from "./catalogFilter";
import { addOnsOf, placementOf, sourceOf } from "./catalogQueries";
import {
    CatalogScope,
    isCatalogScope,
    listsFlat,
    REVIEW_SCOPE,
    scopedCatalog,
    scopeOfAddOn,
    SCOPE_ORDER,
} from "./catalogScope";
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
import { catalogPhaseOf, openingScopeOf } from "./listContent";
import { placedActions, reviewOf } from "./placedActions";
import { Banner, resultBannerOf } from "./resultBanner";

interface PendingRequest {
    readonly targetId: string;
    readonly actionKind: ActionKindPayload;
    readonly slot: number;
}

/** Each tab's own selected add-on. */
type Selection = Readonly<Partial<Record<CatalogScope, string>>>;

/** Which pane a narrow view shows; a wide one shows both. */
type Pane = "list" | "detail";

export interface ViewState {
    readonly model?: AddOnCatalogPayload;
    readonly expansion: Expansion;
    /** What the user opened or closed while a filter is on: kept with the page, and only while the filter stays on. */
    readonly filterExpansion: Expansion;
    readonly scope: CatalogScope;
    /** The tab the user chose; only it is kept. */
    readonly chosenScope?: CatalogScope;
    /** The tab is decided: by the user, a reveal, or the first model that lists something. */
    readonly scopeSettled: boolean;
    readonly selection: Selection;
    readonly filter: CatalogFilter;
    readonly pane: Pane;
    readonly pending: ReadonlyMap<number, PendingRequest>;
    readonly banner?: Banner;
    readonly reveal?: AddOnRevealPayload;
    readonly lastRevealId: number;
    readonly awaitingFocus?: FocusTarget;
    readonly nextRequestId: number;
}

/**
 * What the view keeps across a reload of its page: the user's own choices,
 * never a request or a tab the view opened on by itself. The search and the
 * filter chips stay with the page.
 */
export interface PersistedChoices {
    readonly expansion?: readonly (readonly [string, boolean])[];
    readonly chosenScope?: CatalogScope;
    readonly selection?: Selection;
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
    | { readonly kind: "scopeChosen"; readonly scope: CatalogScope }
    | { readonly kind: "addOnSelected"; readonly addOnId: string }
    | { readonly kind: "backChosen" }
    | { readonly kind: "queryChanged"; readonly query: string }
    | { readonly kind: "kindToggled"; readonly addOnKind: AddOnKind }
    | { readonly kind: "needsReviewToggled" }
    | { readonly kind: "filtersCleared" };

export interface Transition {
    readonly state: ViewState;
    readonly send?: { readonly requestId: number; readonly request: AddOnRequestPayload };
    readonly focus?: FocusTarget;
}

/** Busy rows and sources, and the catalog actions under {@link CATALOG_TARGET}. */
export const CATALOG_TARGET = "catalog";

export function initialViewState(persisted?: PersistedChoices): ViewState {
    const chosenScope = isCatalogScope(persisted?.chosenScope) ? persisted.chosenScope : undefined;
    return {
        expansion: new Map(persisted?.expansion ?? []),
        filterExpansion: new Map(),
        scope: chosenScope ?? "workspace",
        ...(chosenScope && { chosenScope }),
        scopeSettled: chosenScope !== undefined,
        selection: selectionOf(persisted?.selection),
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
        ...(state.chosenScope && { chosenScope: state.chosenScope }),
        selection: state.selection,
        lastRevealId: state.lastRevealId,
    };
}

export function isBusy(state: ViewState, targetId: string): boolean {
    return [...state.pending.values()].some((each) => each.targetId === targetId);
}

export function selectedIdOf(state: ViewState): string | undefined {
    return state.selection[state.scope];
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
 * what to ask the host, which add-on each tab selects and where focus goes.
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
        case "scopeChosen":
            return {
                state: {
                    ...state,
                    scope: event.scope,
                    chosenScope: event.scope,
                    scopeSettled: true,
                },
            };
        case "addOnSelected":
            return {
                state: {
                    ...state,
                    selection: { ...state.selection, [state.scope]: event.addOnId },
                    pane: "detail",
                },
            };
        case "backChosen":
            return { state: { ...state, pane: "list" } };
        case "queryChanged":
            return { state: { ...state, filter: { ...state.filter, query: event.query } } };
        case "kindToggled":
            return { state: { ...state, filter: withKindToggled(state.filter, event.addOnKind) } };
        case "needsReviewToggled":
            return {
                state: {
                    ...state,
                    filter: { ...state.filter, onlyNeedsReview: !state.filter.onlyNeedsReview },
                },
            };
        case "filtersCleared":
            return { state: { ...state, filter: NO_FILTER } };
    }
}

/** The first model that lists something decides the tab the user did not choose, before a waiting reveal applies. */
function modelArrived(state: ViewState, model: AddOnCatalogPayload): Change {
    if (state.model !== undefined && model.revision < state.model.revision) return { state };
    const opening =
        !state.scopeSettled && catalogPhaseOf(model) === "ready"
            ? { scope: openingScopeOf(model), scopeSettled: true }
            : {};
    return revealed({
        ...state,
        ...opening,
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
 * Lands on the first of the rows a "Review…" left, in model order, once the
 * model holds one: its tab, its open review and its detail, past any filter
 * that hid it.
 */
function rowsRevealed(
    state: ViewState,
    model: AddOnCatalogPayload,
    reveal: Extract<AddOnRevealPayload, { kind: "rows" }>,
): Change {
    const heads = headsOf(model);
    const target = heads.find(({ id }) => reveal.addOnIds.includes(id));
    const scope = target && scopeOfAddOn(model, target.id);
    if (target === undefined || scope === undefined) return { state };
    const expansion = new Map(state.expansion);
    const filterExpansion = new Map(state.filterExpansion);
    ancestorsOf(heads, target.id).forEach((id) => {
        expansion.set(id, true);
        filterExpansion.set(id, true);
    });
    const addOn = placementOf(model.groups, target.id)?.addOn;
    if (addOn !== undefined && reviewOf(addOn) !== undefined) {
        expansion.set(reviewKeyOf(target.id), true);
    }
    const shown = filteredGroups(scopedCatalog(model, scope), state.filter);
    const filter = placementOf(shown, target.id) === undefined ? NO_FILTER : state.filter;
    return {
        state: {
            ...state,
            reveal: undefined,
            expansion,
            filterExpansion,
            scope,
            scopeSettled: true,
            filter,
            selection: { ...state.selection, [scope]: target.id },
            pane: "detail",
            lastRevealId: reveal.revealId,
        },
        focus: { kind: "head", headId: target.id, reveal: true },
    };
}

/**
 * Review Add-ons: the workspace with only the review chip, every head open,
 * its add-on to review selected and focused.
 */
function reviewRevealed(state: ViewState, model: AddOnCatalogPayload, revealId: number): Change {
    const reviewing: ViewState = {
        ...state,
        reveal: undefined,
        scope: REVIEW_SCOPE,
        scopeSettled: true,
        filter: NEEDS_REVIEW_ONLY,
        filterExpansion: new Map(),
        pane: "list",
        lastRevealId: revealId,
    };
    const shown = filteredGroups(scopedCatalog(model, REVIEW_SCOPE), NEEDS_REVIEW_ONLY);
    const inSight = rowsInSight(shown, listExpansionOf(reviewing), listsFlat(REVIEW_SCOPE));
    const selected = settledSelection(state.selection[REVIEW_SCOPE], shown, [], inSight);
    const { [REVIEW_SCOPE]: _dropped, ...others } = state.selection;
    return {
        state: {
            ...reviewing,
            selection: selected === undefined ? others : { ...others, [REVIEW_SCOPE]: selected },
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
        state: { ...state, banner: undefined, pending, nextRequestId: requestId + 1 },
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

/**
 * Settles the tab's selection after the list changed. A narrow view that
 * showed the detail of an add-on the list lost goes back to the list.
 */
function withSelection(change: Change, before: ViewState): Change {
    const { state } = change;
    const { model, scope } = state;
    if (model === undefined) return change;
    const shown = filteredGroups(scopedCatalog(model, scope), state.filter);
    const shownBefore =
        before.model === undefined
            ? []
            : addOnsOf(filteredGroups(scopedCatalog(before.model, scope), before.filter));
    const remembered = state.selection[scope];
    const selected = settledSelection(
        remembered,
        shown,
        shownBefore.map(({ id }) => id),
        rowsInSight(shown, listExpansionOf(state), listsFlat(scope)),
    );
    if (selected === remembered) return change;
    const { [scope]: _dropped, ...others } = state.selection;
    const selection = selected === undefined ? others : { ...others, [scope]: selected };
    const pane = remembered === undefined ? state.pane : "list";
    return { ...change, state: { ...state, selection, pane } };
}

/**
 * Names a waiting focus target as the transition's focus once the model holds
 * it. A model without it ends the wait: focus goes to what is left of its
 * add-on or source, else to the tab's selection.
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
    const ownerId =
        target.kind === "review"
            ? target.addOnId
            : target.kind === "action"
              ? target.targetId
              : undefined;
    if (ownerId !== undefined && isListed(model, ownerId)) return { kind: "head", headId: ownerId };
    const selected = selectedIdOf(state);
    return selected === undefined ? undefined : { kind: "head", headId: selected };
}

function selectionOf(persisted: Selection | undefined): Selection {
    if (typeof persisted !== "object" || persisted === null) return {};
    return Object.fromEntries(
        SCOPE_ORDER.flatMap((scope) => {
            const id: unknown = persisted[scope];
            return typeof id === "string" ? [[scope, id]] : [];
        }),
    );
}
