import { describe, expect, it } from "vitest";

import {
    ElementTemplateFileQuery,
    GetElementTemplateFileCommand,
    LogErrorCommand,
    SyncDocumentCommand,
    TEMPLATE_EDITOR_COMMAND_TYPES,
    TemplateEditorCommandType,
} from "@miragon/bpmn-modeler-shared";

import { MessageRoute } from "../../../editorSession/service/WebviewMessageRouter";
import { DocumentRenderParticipant } from "../../../editorSession/service/DocumentRenderParticipant";
import { FakeEditorHandle, InMemorySettings, RecordingNotifier } from "../../../testing";
import { ElementTemplateEditorFeature } from "./ElementTemplateEditorFeature";
import { TemplateEditorLanguageParticipant } from "../service/TemplateEditorLanguageParticipant";

const PATH = "/work/.camunda/element-templates/status.json";
const TEXT = '{"id":"status"}';

const HANDLED: MessageRoute = { kind: "handled" };

/** Every command the page may post; a new one fails to compile until it has a row. */
const ROUTES: Record<TemplateEditorCommandType, MessageRoute> = {
    GetElementTemplateFileCommand: HANDLED,
    SyncDocumentCommand: HANDLED,
    DocumentFlushedCommand: HANDLED,
    LogDebugCommand: HANDLED,
    LogInfoCommand: HANDLED,
    LogWarningCommand: HANDLED,
    LogErrorCommand: HANDLED,
};

function open() {
    const notifier = new RecordingNotifier();
    const feature = new ElementTemplateEditorFeature({
        settings: new InMemorySettings({ language: "de" }),
        notifier,
    });
    const editor = new FakeEditorHandle(PATH);
    editor.content = TEXT;
    feature.store.register(editor);
    return { feature, editor, notifier };
}

describe("ElementTemplateEditorFeature", () => {
    it.each(TEMPLATE_EDITOR_COMMAND_TYPES)("routes %s", (type) => {
        const { feature } = open();

        expect(feature.router.routeOf(type)).toEqual(ROUTES[type]);
    });

    it("runs the render and language participants, in that order", () => {
        const { feature } = open();

        expect(feature.participants.map((participant) => participant.constructor)).toEqual([
            DocumentRenderParticipant,
            TemplateEditorLanguageParticipant,
        ]);
    });

    it("answers the page's request with the file", async () => {
        const { feature, editor } = open();

        await feature.router.dispatch(new GetElementTemplateFileCommand(), editor.id);

        expect(editor.postedOfType("ElementTemplateFileQuery")).toEqual([
            new ElementTemplateFileQuery(TEXT, "de", 0, "status.json"),
        ]);
    });

    it("writes the page's edit into the document", async () => {
        const { feature, editor } = open();

        await feature.router.dispatch(new SyncDocumentCommand('{"id":"edited"}', 0), editor.id);

        expect(editor.content).toBe('{"id":"edited"}');
    });

    it("tags what the page logs with its file", async () => {
        const { feature, editor, notifier } = open();

        await feature.router.dispatch(new LogErrorCommand("boom"), editor.id);

        expect(notifier.logged("error")).toEqual([expect.stringContaining("status.json")]);
    });

    it("keeps its sessions out of a modeler's store", () => {
        const first = open();
        const second = open();

        expect(first.feature.store).not.toBe(second.feature.store);
    });
});
