import type { AddOnsViewCommand } from "@miragon/bpmn-modeler-shared";

import type { PersistedChoices } from "../domain/viewState";
import type { AddOnsHost } from "../port/addOnsHost";

/** A host that keeps what the page posted and persisted. */
export class RecordingHost implements AddOnsHost {
    readonly posted: AddOnsViewCommand[] = [];
    state: PersistedChoices | undefined;

    constructor(saved?: PersistedChoices) {
        this.state = saved;
    }

    getState = (): PersistedChoices | undefined => this.state;

    setState = (state: PersistedChoices): void => {
        this.state = state;
    };

    updateState = (state: Partial<PersistedChoices>): void => {
        this.state = { ...this.state, ...state };
    };

    postMessage = (message: AddOnsViewCommand): void => {
        this.posted.push(message);
    };
}
