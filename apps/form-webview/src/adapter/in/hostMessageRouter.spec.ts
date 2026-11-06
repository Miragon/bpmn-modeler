import { describe, expect, it, vi } from "vitest";

import {
    FlushDocumentQuery,
    FormFileQuery,
    FormInputValuesQuery,
    ReleaseDocumentFlushQuery,
    type Command,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { routeFormHostMessage } from "./hostMessageRouter";

function targets() {
    return {
        app: {
            load: vi.fn().mockResolvedValue(undefined),
            setInputValues: vi.fn().mockResolvedValue(undefined),
        },
        respondToFlush: vi.fn().mockResolvedValue(undefined),
    };
}

const fromHost = (data: Query | Command) => new MessageEvent("message", { data });

describe("routeFormHostMessage", () => {
    it("loads a form file into the editor at the host's revision", () => {
        const routed = targets();

        routeFormHostMessage(
            fromHost(new FormFileQuery('{"components":[]}', 3)),
            routed.app,
            routed.respondToFlush,
        );

        expect(routed.app.load).toHaveBeenCalledExactlyOnceWith('{"components":[]}', 3);
        expect(routed.app.setInputValues).not.toHaveBeenCalled();
        expect(routed.respondToFlush).not.toHaveBeenCalled();
    });

    it("hands the input values to the preview", () => {
        const routed = targets();

        routeFormHostMessage(
            fromHost(new FormInputValuesQuery('{"customer":"Ada"}')),
            routed.app,
            routed.respondToFlush,
        );

        expect(routed.app.setInputValues).toHaveBeenCalledExactlyOnceWith('{"customer":"Ada"}');
        expect(routed.app.load).not.toHaveBeenCalled();
        expect(routed.respondToFlush).not.toHaveBeenCalled();
    });

    it.each([new FlushDocumentQuery(9), new ReleaseDocumentFlushQuery(9)])(
        "answers %o through the flush responder",
        (query) => {
            const routed = targets();

            routeFormHostMessage(fromHost(query), routed.app, routed.respondToFlush);

            expect(routed.respondToFlush).toHaveBeenCalledExactlyOnceWith(query);
            expect(routed.app.load).not.toHaveBeenCalled();
            expect(routed.app.setInputValues).not.toHaveBeenCalled();
        },
    );

    it("ignores a message whose payload has the wrong shape", () => {
        const routed = targets();

        routeFormHostMessage(
            fromHost({ type: "FormFileQuery", content: 42 } as unknown as Query),
            routed.app,
            routed.respondToFlush,
        );

        expect(routed.app.load).not.toHaveBeenCalled();
        expect(routed.app.setInputValues).not.toHaveBeenCalled();
        expect(routed.respondToFlush).not.toHaveBeenCalled();
    });
});
