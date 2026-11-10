import { describe, expect, it } from "vitest";

import {
    AddOnActionResultQuery,
    AddOnCatalogQuery,
    LanguageQuery,
    RevealAddOnsQuery,
} from "@miragon/bpmn-modeler-shared";

import { CATALOG } from "../../__fixtures__/catalogs";
import type { ViewEvent } from "../../domain/viewState";
import { routeHostMessage } from "./hostMessageRouter";

function routed(message: unknown): ViewEvent[] {
    const events: ViewEvent[] = [];
    routeHostMessage(message, (event) => events.push(event));
    return events;
}

describe("routeHostMessage", () => {
    it.each<{ case: string; message: unknown; events: ViewEvent[] }>([
        {
            case: "a catalog",
            message: new AddOnCatalogQuery(CATALOG),
            events: [{ kind: "modelArrived", model: CATALOG }],
        },
        {
            case: "a result",
            message: new AddOnActionResultQuery(3, { kind: "done" }),
            events: [{ kind: "resultArrived", requestId: 3, result: { kind: "done" } }],
        },
        {
            case: "a reveal",
            message: new RevealAddOnsQuery({ revealId: 1, addOnIds: ["plugin:/x"] }),
            events: [{ kind: "revealArrived", reveal: { revealId: 1, addOnIds: ["plugin:/x"] } }],
        },
        {
            case: "nothing for another surface's query",
            message: new LanguageQuery("de"),
            events: [],
        },
        { case: "nothing for a message without a type", message: { model: CATALOG }, events: [] },
        { case: "nothing for no message", message: null, events: [] },
    ])("turns $case into view events", ({ message, events }) => {
        expect(routed(message)).toEqual(events);
    });
});
