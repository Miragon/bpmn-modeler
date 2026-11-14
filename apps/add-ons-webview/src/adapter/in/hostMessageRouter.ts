import { asProtocolMessage, type BrandMode } from "@miragon/bpmn-modeler-shared";

import type { ViewEvent } from "../../domain/viewState";

/**
 * The host's queries as view events, and its brand mode for the page, which
 * the view state does not hold; another surface's query or a stray message is
 * dropped.
 */
export function routeHostMessage(
    message: unknown,
    dispatch: (event: ViewEvent) => void,
    showBrandMode: (mode: BrandMode) => void,
): void {
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
        case "ShowAddOnQuery":
            dispatch({ kind: "addOnShown", addOnId: query.addOnId });
            break;
        case "AddOnReadmeQuery":
            dispatch({ kind: "readmeArrived", targetId: query.targetId, readme: query.readme });
            break;
        case "BrandModeQuery":
            showBrandMode(query.mode);
            break;
        default:
            break;
    }
}
