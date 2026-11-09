import { GetAddOnCatalogCommand } from "@miragon/bpmn-modeler-shared";

import { CatalogView } from "../adapter/in/catalogView";
import { routeHostMessage } from "../adapter/in/hostMessageRouter";
import { bindOutlineKeyboard } from "../adapter/in/outlineKeyboard";
import type { AddOnsHost } from "../port/addOnsHost";
import { AddOnsViewSession } from "../service/AddOnsViewSession";

export function bootstrap(host: AddOnsHost): void {
    // Every host shell ships only an empty `#app`; the view builds itself in it.
    const app = document.getElementById("app");
    if (app === null) return;
    const view = new CatalogView(app, (event) => session.dispatch(event));
    const session = new AddOnsViewSession(host, (state, focus) => view.render(state, focus));
    bindOutlineKeyboard(app, session, view);
    window.addEventListener("message", (event: MessageEvent<unknown>) =>
        routeHostMessage(event.data, (viewEvent) => session.dispatch(viewEvent)),
    );
    window.addEventListener("focus", () => view.focusActiveHeadFromOutside());
    view.render(session.state);
    host.postMessage(new GetAddOnCatalogCommand());
}
