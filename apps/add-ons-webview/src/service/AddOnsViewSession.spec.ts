import { describe, expect, it } from "vitest";

import { AddOnRequestCommand, asProtocolMessage } from "@miragon/bpmn-modeler-shared";

import { CATALOG, MAIL, MARKETPLACE_SOURCE, PALETTE } from "../__fixtures__/catalogs";
import { RecordingHost } from "../__fixtures__/recordingHost";
import type { FocusTarget } from "../domain/focusAfter";
import { persistedChoicesOf, selectedIdOf, ViewState } from "../domain/viewState";
import { AddOnsViewSession } from "./AddOnsViewSession";

function setUp(host = new RecordingHost()) {
    const renders: { state: ViewState; focus?: FocusTarget }[] = [];
    const session = new AddOnsViewSession(host, (state, focus) =>
        renders.push({ state, ...(focus && { focus }) }),
    );
    return { host, renders, session };
}

describe("AddOnsViewSession", () => {
    it("posts each request with a rising id", () => {
        const { host, session } = setUp();
        session.dispatch({ kind: "modelArrived", model: CATALOG });

        session.dispatch({ kind: "actionChosen", actionKind: "revoke", targetId: PALETTE.id });
        session.dispatch({ kind: "actionChosen", actionKind: "pruneCache" });

        expect(host.posted).toEqual([
            new AddOnRequestCommand(1, { kind: "revoke", addOnId: PALETTE.id }),
            new AddOnRequestCommand(2, { kind: "pruneCache" }),
        ]);
    });

    it("keeps the user's choices in the host and starts from them after a reload", () => {
        const { host, session } = setUp();
        session.dispatch({ kind: "modelArrived", model: CATALOG });
        session.dispatch({ kind: "toggled", key: MARKETPLACE_SOURCE.id });
        session.dispatch({ kind: "addOnSelected", addOnId: MAIL.id });

        const reloaded = setUp(new RecordingHost(host.state)).session;

        expect([
            reloaded.state.expansion.get(MARKETPLACE_SOURCE.id),
            selectedIdOf(reloaded.state),
        ]).toEqual([true, MAIL.id]);
    });

    it("ends on the newest state when the host answers a request at once", () => {
        const host = new RecordingHost();
        const { renders, session } = setUp(host);
        session.dispatch({ kind: "modelArrived", model: CATALOG });
        host.postMessage = (message) => {
            const command = asProtocolMessage(message);
            if (command.type === "AddOnRequestCommand") {
                session.dispatch({
                    kind: "resultArrived",
                    requestId: command.requestId,
                    result: { kind: "done", message: "Revoked Palette." },
                });
            }
        };

        session.dispatch({ kind: "actionChosen", actionKind: "revoke", targetId: PALETTE.id });

        expect(renders.at(-1)?.state).toBe(session.state);
        expect(session.state.pending.size).toBe(0);
        expect(host.state).toEqual(persistedChoicesOf(session.state));
    });

    it("renders each change, and a reveal with focus on its row", () => {
        const { renders, session } = setUp();

        session.dispatch({ kind: "modelArrived", model: CATALOG });
        session.dispatch({
            kind: "revealArrived",
            reveal: { kind: "rows", revealId: 1, addOnIds: [MAIL.id] },
        });

        expect(renders.map(({ focus }) => focus)).toEqual([
            undefined,
            { kind: "head", headId: MAIL.id, reveal: true },
        ]);
        expect(selectedIdOf(session.state)).toBe(MAIL.id);
    });
});
