import { describe, expect, it, vi } from "vitest";

import {
    DmnFileQuery,
    DmnModelerSettingQuery,
    FlushDocumentQuery,
    LanguageQuery,
    PropertiesPanelStateQuery,
    ReleaseDocumentFlushQuery,
    TakeFocusQuery,
} from "@miragon/bpmn-modeler-shared";

import { routeDmnHostMessage } from "./hostMessageRouter";

function createTargets() {
    return {
        session: {
            receiveHostFile: vi.fn(async (_query: DmnFileQuery) => undefined),
            respondToFlush: vi.fn(
                async (_query: FlushDocumentQuery | ReleaseDocumentFlushQuery) => undefined,
            ),
            applyLanguage: vi.fn(async (_locale: string) => undefined),
            focusCanvas: vi.fn(),
        },
        replies: {
            panelState: { done: vi.fn() },
            settings: { done: vi.fn() },
            theme: { setMode: vi.fn() },
        },
    };
}

describe("routeDmnHostMessage", () => {
    it("hands a host document to the session", async () => {
        const { session, replies } = createTargets();
        const query = new DmnFileQuery("<dmn />", 3);

        await routeDmnHostMessage(query, session, replies);

        expect(session.receiveHostFile).toHaveBeenCalledWith(query);
    });

    it("answers the panel-state wait", async () => {
        const { session, replies } = createTargets();
        const query = new PropertiesPanelStateQuery(false);

        await routeDmnHostMessage(query, session, replies);

        expect(replies.panelState.done).toHaveBeenCalledWith(query);
    });

    it("applies the colour theme before answering the settings wait", async () => {
        const { session, replies } = createTargets();
        const query = new DmnModelerSettingQuery({ colorTheme: "light" });

        await routeDmnHostMessage(query, session, replies);

        expect(replies.theme.setMode).toHaveBeenCalledWith("light");
        expect(replies.settings.done).toHaveBeenCalledWith(query);
        expect(replies.theme.setMode.mock.invocationCallOrder[0]).toBeLessThan(
            replies.settings.done.mock.invocationCallOrder[0],
        );
    });

    it("switches the modeler language", async () => {
        const { session, replies } = createTargets();

        await routeDmnHostMessage(new LanguageQuery("de"), session, replies);

        expect(session.applyLanguage).toHaveBeenCalledWith("de");
    });

    it("focuses the canvas when nothing else holds focus", async () => {
        const { session, replies } = createTargets();

        await routeDmnHostMessage(new TakeFocusQuery(), session, replies);

        expect(session.focusCanvas).toHaveBeenCalledOnce();
    });

    it.each([new FlushDocumentQuery(1, true), new ReleaseDocumentFlushQuery(1)])(
        "lets the session answer a $type",
        async (query) => {
            const { session, replies } = createTargets();

            await routeDmnHostMessage(query, session, replies);

            expect(session.respondToFlush).toHaveBeenCalledWith(query);
        },
    );

    it("ignores a message meant for another editor", async () => {
        const { session, replies } = createTargets();

        await routeDmnHostMessage({ type: "BpmnFileQuery" }, session, replies);

        for (const handler of [
            ...Object.values(session),
            replies.panelState.done,
            replies.settings.done,
            replies.theme.setMode,
        ]) {
            expect(handler).not.toHaveBeenCalled();
        }
    });
});
