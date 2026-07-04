import { describe, expect, it, vi } from "vitest";

import { DocumentChangeEvent } from "@miragon/bpmn-modeler-core";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { EditorSessionContext } from "../../../editor-session/EditorSessionParticipant";
import { BpmnRenderParticipant } from "./BpmnRenderParticipant";

const EDITOR_ID = "file:///diagram.bpmn";

/** Context double that records the document-change and dispose callbacks. */
function createContext() {
    const captured: {
        documentChange?: (event: DocumentChangeEvent) => void;
        dispose?: () => void;
    } = {};
    const context: EditorSessionContext = {
        editorId: EDITOR_ID,
        panel: {} as never,
        onDocumentChange: (cb) => void (captured.documentChange = cb),
        onSettingChange: vi.fn(),
        onDispose: (cb) => void (captured.dispose = cb),
        addDisposable: vi.fn(),
    };
    return { context, captured };
}

function documentEvent(overrides: Partial<Record<keyof DocumentChangeEvent, unknown>>) {
    return {
        hasContentChanges: () => true,
        documentPath: () => "/diagram.bpmn",
        documentUriString: () => EDITOR_ID,
        ...overrides,
    } as unknown as DocumentChangeEvent;
}

function createService() {
    return {
        registerSession: vi.fn(),
        display: vi.fn(),
        disposeSession: vi.fn(),
    } as unknown as BpmnModelerService;
}

const notifier = { logDebug: vi.fn() } as unknown as VsCodeNotifier;

describe("BpmnRenderParticipant", () => {
    it("registers the modeler session on resolve", () => {
        const service = createService();
        const { context } = createContext();

        new BpmnRenderParticipant(service, notifier).onResolve(context);

        expect(service.registerSession).toHaveBeenCalledWith(EDITOR_ID);
    });

    it("re-renders on a matching .bpmn content change", () => {
        const service = createService();
        const { context, captured } = createContext();
        new BpmnRenderParticipant(service, notifier).onResolve(context);

        captured.documentChange?.(documentEvent({}));

        expect(service.display).toHaveBeenCalledWith(EDITOR_ID);
    });

    it("ignores changes to other documents or non-.bpmn files", () => {
        const service = createService();
        const { context, captured } = createContext();
        new BpmnRenderParticipant(service, notifier).onResolve(context);

        captured.documentChange?.(documentEvent({ documentUriString: () => "file:///other.bpmn" }));
        captured.documentChange?.(documentEvent({ documentPath: () => "/diagram.dmn" }));
        captured.documentChange?.(documentEvent({ hasContentChanges: () => false }));

        expect(service.display).not.toHaveBeenCalled();
    });

    it("disposes the session on teardown", () => {
        const service = createService();
        const { context, captured } = createContext();
        new BpmnRenderParticipant(service, notifier).onResolve(context);

        captured.dispose?.();

        expect(service.disposeSession).toHaveBeenCalledWith(EDITOR_ID);
    });
});
