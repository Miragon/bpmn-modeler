import type { AddOnRequestPayload } from "@miragon/bpmn-modeler-shared";

import type { ActionKindPayload } from "./focusAfter";

type RequestOf = (targetId: string, revision: number) => AddOnRequestPayload;

const REQUEST_OF: Record<ActionKindPayload, RequestOf> = {
    inspect: (addOnId) => ({ kind: "inspect", addOnId }),
    allow: (addOnId, revision) => ({ kind: "allow", addOnId, revision }),
    revoke: (addOnId) => ({ kind: "revoke", addOnId }),
    enable: (addOnId) => ({ kind: "enable", addOnId }),
    disable: (addOnId) => ({ kind: "disable", addOnId }),
    removeMarketplace: (sourceId) => ({ kind: "removeMarketplace", sourceId }),
    enableTemplates: (sourceId) => ({ kind: "enableTemplates", sourceId }),
    disableTemplates: (sourceId) => ({ kind: "disableTemplates", sourceId }),
    addMarketplace: () => ({ kind: "addMarketplace" }),
    updateMarketplaces: () => ({ kind: "updateMarketplaces" }),
    pruneCache: () => ({ kind: "pruneCache" }),
};

export function isActionKind(kind: string): kind is ActionKindPayload {
    return Object.prototype.hasOwnProperty.call(REQUEST_OF, kind);
}

/** @param revision the model on screen, which an allow names so the core checks it against what it showed */
export function actionRequestOf(
    actionKind: ActionKindPayload,
    targetId: string,
    revision: number,
): AddOnRequestPayload {
    return REQUEST_OF[actionKind](targetId, revision);
}
