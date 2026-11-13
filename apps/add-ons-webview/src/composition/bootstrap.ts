import {
    ADD_ONS_PAGE_ATTRIBUTE,
    addOnsPageOf,
    GetAddOnCatalogCommand,
} from "@miragon/bpmn-modeler-shared";

import { AddOnsView } from "../adapter/in/addOnsView";
import { applyBrandMode } from "../adapter/in/brandModeRoot";
import { routeHostMessage } from "../adapter/in/hostMessageRouter";
import type { Layout } from "../adapter/in/layout";
import type { AddOnsHost } from "../port/addOnsHost";
import { AddOnsViewSession } from "../service/AddOnsViewSession";

/** @param layout the page's layout; a spec passes one, as jsdom lays nothing out */
export function bootstrap(host: AddOnsHost, layout?: Layout): void {
    // Every host shell ships only an empty `#app`; the view builds itself in it.
    const app = document.getElementById("app");
    if (app === null) return;
    // The host's shell says which page it serves; a shell that says nothing serves the list.
    const page = addOnsPageOf(
        document.documentElement.getAttribute(ADD_ONS_PAGE_ATTRIBUTE) ?? undefined,
    );
    const view = new AddOnsView(app, (event) => session.dispatch(event), layout);
    const session = new AddOnsViewSession(host, (state, focus) => view.render(state, focus), page);
    window.addEventListener("message", (event: MessageEvent<unknown>) =>
        routeHostMessage(
            event.data,
            (viewEvent) => session.dispatch(viewEvent),
            (mode) => applyBrandMode(document.documentElement, mode),
        ),
    );
    // VS Code's view focus and IntelliJ's tool window activation focus the page, not a control.
    window.addEventListener("focus", () => view.focusFromOutside());
    view.render(session.state);
    host.postMessage(new GetAddOnCatalogCommand());
}
