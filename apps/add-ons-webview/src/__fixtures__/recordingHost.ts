import type { AddOnsViewCommand } from "@miragon/bpmn-modeler-shared";

import type { AddOnsHost, PersistedViewState } from "../port/addOnsHost";

/** A host that keeps what the page posted and persisted. */
export class RecordingHost implements AddOnsHost {
    readonly posted: AddOnsViewCommand[] = [];
    state: PersistedViewState | undefined;

    constructor(saved?: PersistedViewState) {
        this.state = saved;
    }

    getState = (): PersistedViewState | undefined => this.state;

    setState = (state: PersistedViewState): void => {
        this.state = state;
    };

    updateState = (state: Partial<PersistedViewState>): void => {
        this.state = { ...this.state, ...state };
    };

    postMessage = (message: AddOnsViewCommand): void => {
        this.posted.push(message);
    };
}
