import type {
    AddOnActionResultPayload,
    AddOnCatalogPayload,
    AddOnRequestPayload,
    AddOnRevealPayload,
} from "@miragon/bpmn-modeler-shared";

import { ActionKindPayload, actionRequestOf, isActionKind } from "./actionRequest";
import { focusAfterDone, FocusTarget, isFocusable, neighbourAfterRemoval } from "./focusAfter";
import {
    ancestorsOf,
    Expansion,
    isOpen,
    OutlineHead,
    outlineHeadsOf,
    prunedExpansion,
    visibleHeadsOf,
} from "./outline";
import { placedActions } from "./placedActions";
import { Banner, resultBannerOf } from "./resultBanner";

interface PendingRequest {
    readonly targetId: string;
    readonly actionKind: ActionKindPayload;
    readonly slot: number;
}

export interface ViewState {
    readonly model?: AddOnCatalogPayload;
    readonly expansion: Expansion;
    readonly activeHead?: string;
    readonly pending: ReadonlyMap<number, PendingRequest>;
    readonly banner?: Banner;
    readonly reveal?: AddOnRevealPayload;
    readonly lastRevealId: number;
    readonly awaitingFocus?: FocusTarget;
    readonly nextRequestId: number;
}

/** What the view keeps across a reload of its page: the user's own choices, never a request. */
export interface PersistedChoices {
    readonly expansion?: readonly (readonly [string, boolean])[];
    readonly activeHead?: string;
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
    | { readonly kind: "headActivated"; readonly headId: string }
    | { readonly kind: "bannerDismissed" };

export interface Transition {
    readonly state: ViewState;
    readonly send?: { readonly requestId: number; readonly request: AddOnRequestPayload };
    readonly focus?: FocusTarget;
}

/** Busy rows and sources, and the toolbar under {@link CATALOG_TARGET}. */
export const CATALOG_TARGET = "catalog";

export function initialViewState(persisted?: PersistedChoices): ViewState {
    return {
        expansion: new Map(persisted?.expansion ?? []),
        activeHead: persisted?.activeHead,
        pending: new Map(),
        lastRevealId: persisted?.lastRevealId ?? 0,
        nextRequestId: 1,
    };
}

export function persistedChoicesOf(state: ViewState): PersistedChoices {
    return {
        expansion: [...state.expansion],
        ...(state.activeHead !== undefined && { activeHead: state.activeHead }),
        lastRevealId: state.lastRevealId,
    };
}

export function isBusy(state: ViewState, targetId: string): boolean {
    return [...state.pending.values()].some((each) => each.targetId === targetId);
}

/**
 * The view's one decision: what an event from the host or the user changes,
 * what to ask the host and where focus goes. Focus is only named once its
 * target is on screen.
 */
export function nextViewState(state: ViewState, event: ViewEvent): Transition {
    return withFocus(changedBy(state, event));
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
        case "headActivated":
            return state.model !== undefined && isShown(state.model, state.expansion, event.headId)
                ? { state: { ...state, activeHead: event.headId } }
                : { state };
        case "bannerDismissed":
            return { state: { ...state, banner: undefined } };
    }
}

function modelArrived(state: ViewState, model: AddOnCatalogPayload): Change {
    if (state.model !== undefined && model.revision < state.model.revision) return { state };
    const expansion = prunedExpansion(model, state.expansion);
    const next = visibleHeadsOf(model, expansion);
    const active = state.activeHead;
    const activeHead =
        active !== undefined && next.some(({ id }) => id === active)
            ? active
            : neighbourOf(state, active, next);
    const awaitingFocus =
        state.awaitingFocus && fallbackFocus(state.awaitingFocus, model, expansion, state);
    return revealed({ ...state, model, expansion, activeHead, awaitingFocus });
}

function neighbourOf(
    state: ViewState,
    removedId: string | undefined,
    next: readonly OutlineHead[],
): string | undefined {
    const previous = state.model === undefined ? [] : visibleHeadsOf(state.model, state.expansion);
    return removedId === undefined ? next[0]?.id : neighbourAfterRemoval(removedId, previous, next);
}

/** A target the new model cannot show falls back to its row, else to the row's neighbour. */
function fallbackFocus(
    target: FocusTarget,
    model: AddOnCatalogPayload,
    expansion: Expansion,
    state: ViewState,
): FocusTarget | undefined {
    if (isFocusable(target, model, expansion) || target.kind === "toolbar") return target;
    const id =
        target.kind === "head"
            ? target.headId
            : target.kind === "review"
              ? target.addOnId
              : target.targetId;
    const row: FocusTarget = { kind: "head", headId: id };
    if (isFocusable(row, model, expansion)) return row;
    const neighbour = neighbourOf(state, id, visibleHeadsOf(model, expansion));
    return neighbour === undefined ? undefined : { kind: "head", headId: neighbour };
}

/** Applies a waiting reveal once the model holds one of its rows: the first in model order. */
function revealed(state: ViewState): Change {
    const { reveal, model } = state;
    if (reveal === undefined || model === undefined) return { state };
    const heads = outlineHeadsOf(model);
    const target = heads.find(({ id }) => reveal.addOnIds.includes(id));
    if (target === undefined) return { state };
    const expansion = new Map(state.expansion);
    ancestorsOf(heads, target.id).forEach((id) => expansion.set(id, true));
    return {
        state: {
            ...state,
            reveal: undefined,
            expansion,
            activeHead: target.id,
            lastRevealId: reveal.revealId,
        },
        focus: { kind: "head", headId: target.id, reveal: true },
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
    const sources = model.groups.flatMap((group) => group.sources);
    const source = sources.find(({ id }) => id === targetId);
    if (source !== undefined) return at(source.actions);
    const addOn = sources.flatMap(({ addOns }) => addOns).find(({ id }) => id === targetId);
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

function toggled(state: ViewState, key: string): Change {
    const { model } = state;
    if (model === undefined) return { state };
    const head = outlineHeadsOf(model).find(({ id }) => id === key);
    const open =
        head === undefined ? isReviewOpenKey(key, state.expansion) : isOpen(head, state.expansion);
    const expansion = new Map(state.expansion).set(key, !open);
    const toggledState = { ...state, expansion };
    const active = state.activeHead;
    if (head === undefined || active === undefined || isShown(model, expansion, active)) {
        return { state: toggledState };
    }
    return {
        state: { ...toggledState, activeHead: head.id },
        focus: { kind: "head", headId: head.id },
    };
}

function isReviewOpenKey(key: string, expansion: Expansion): boolean {
    return expansion.get(key) ?? true;
}

function isShown(model: AddOnCatalogPayload, expansion: Expansion, id: string): boolean {
    return visibleHeadsOf(model, expansion).some((head) => head.id === id);
}

/** Names a waiting focus target as the transition's focus once it is on screen. */
function withFocus(change: Change): Transition {
    const { state } = change;
    const waiting = state.awaitingFocus;
    if (change.focus !== undefined || waiting === undefined || state.model === undefined) {
        return change;
    }
    if (!isFocusable(waiting, state.model, state.expansion)) return change;
    return { ...change, state: { ...state, awaitingFocus: undefined }, focus: waiting };
}
