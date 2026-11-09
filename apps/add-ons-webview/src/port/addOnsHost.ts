import type { AddOnsViewCommand, HostApi } from "@miragon/bpmn-modeler-shared";

/** What the view keeps across a reload of its page: the user's own choices, never a request. */
export interface PersistedViewState {
    readonly expansion?: readonly (readonly [string, boolean])[];
    readonly activeHead?: string;
    readonly lastRevealId?: number;
}

export type AddOnsHost = HostApi<PersistedViewState, AddOnsViewCommand>;
