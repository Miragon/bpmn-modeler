import type { FocusTarget } from "../domain/focusAfter";
import type { ViewState } from "../domain/viewState";

/** Shows the state; `focus` names where focus goes after this render, if anywhere. */
export type RenderView = (state: ViewState, focus?: FocusTarget) => void;
