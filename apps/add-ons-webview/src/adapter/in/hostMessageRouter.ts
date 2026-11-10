import { asProtocolMessage } from "@miragon/bpmn-modeler-shared";

import type { ViewEvent } from "../../domain/viewState";

/** The host's queries as view events; another surface's query or a stray message is dropped. */
export function routeHostMessage(message: unknown, dispatch: (event: ViewEvent) => void): void {
    if (typeof message !== "object" || message === null || !("type" in message)) return;
    const query = asProtocolMessage(message as { type: string });
    switch (query.type) {
        case "AddOnCatalogQuery":
            dispatch({ kind: "modelArrived", model: query.model });
            break;
        case "AddOnActionResultQuery":
            dispatch({ kind: "resultArrived", requestId: query.requestId, result: query.result });
            break;
        case "RevealAddOnsQuery":
            dispatch({ kind: "revealArrived", reveal: query.reveal });
            break;
        default:
            break;
    }
}
