import { describe, expect, it } from "vitest";

import type { AddOnRequestPayload } from "@miragon/bpmn-modeler-shared";

import { actionRequestOf } from "./actionRequest";
import type { ActionKindPayload } from "./focusAfter";

const ROWS = {
    inspect: { kind: "inspect", addOnId: "target" },
    allow: { kind: "allow", addOnId: "target", revision: 42 },
    revoke: { kind: "revoke", addOnId: "target" },
    enable: { kind: "enable", addOnId: "target" },
    disable: { kind: "disable", addOnId: "target" },
    removeMarketplace: { kind: "removeMarketplace", sourceId: "target" },
    enableTemplates: { kind: "enableTemplates", sourceId: "target" },
    disableTemplates: { kind: "disableTemplates", sourceId: "target" },
    addMarketplace: { kind: "addMarketplace" },
    updateMarketplaces: { kind: "updateMarketplaces" },
    pruneCache: { kind: "pruneCache" },
} satisfies Record<ActionKindPayload, AddOnRequestPayload>;

describe("actionRequestOf", () => {
    it.each(Object.entries(ROWS) as [ActionKindPayload, AddOnRequestPayload][])(
        "asks for %s with what its kind names, an allow with the revision on screen",
        (actionKind, request) => {
            expect(actionRequestOf(actionKind, "target", 42)).toEqual(request);
        },
    );
});
