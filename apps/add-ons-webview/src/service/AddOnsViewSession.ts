import {
    AddOnRequestCommand,
    AddOnsPage,
    GetAddOnAboutCommand,
    OpenAddOnDetailCommand,
} from "@miragon/bpmn-modeler-shared";

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
        page: AddOnsPage = "list",
    ) {
        this.current = initialViewState(host.getState(), page);
    }

    get state(): ViewState {
        return this.current;
    }

    dispatch(event: ViewEvent): void {
        const { state, send, focus, openDetail, askAbout } = nextViewState(this.current, event);
        this.current = state;
        this.host.setState(persistedChoicesOf(state));
        this.render(state, focus);
        // Last, so an answer the host sends at once renders after this state, not under it.
        if (send !== undefined) {
            this.host.postMessage(new AddOnRequestCommand(send.requestId, send.request));
        }
        if (openDetail !== undefined) this.host.postMessage(new OpenAddOnDetailCommand(openDetail));
        if (askAbout !== undefined) this.host.postMessage(new GetAddOnAboutCommand(askAbout));
    }
}
