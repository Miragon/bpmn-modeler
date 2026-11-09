import { AddOnRequestCommand } from "@miragon/bpmn-modeler-shared";

import type { AddOnsHost } from "../port/addOnsHost";
import type { RenderView } from "../port/viewRenderer";
import {
    initialViewState,
    nextViewState,
    persistedChoicesOf,
    ViewEvent,
    ViewState,
} from "../domain/viewState";

/** Holds the view's state, asks the host what the user chose, and keeps the user's choices across a reload. */
export class AddOnsViewSession {
    private current: ViewState;

    constructor(
        private readonly host: AddOnsHost,
        private readonly render: RenderView,
    ) {
        this.current = initialViewState(host.getState());
    }

    get state(): ViewState {
        return this.current;
    }

    dispatch(event: ViewEvent): void {
        const { state, send, focus } = nextViewState(this.current, event);
        this.current = state;
        if (send !== undefined) {
            this.host.postMessage(new AddOnRequestCommand(send.requestId, send.request));
        }
        this.host.setState(persistedChoicesOf(state));
        this.render(state, focus);
    }
}
