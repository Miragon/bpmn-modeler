import { describe, expect, it, vi } from "vitest";

import { DocumentChangeEvent } from "../../../../shared/domain/EditorSession";
import { DmnModelerService } from "../../service/DmnModelerService";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { EditorSessionContext } from "../../../editor-session/EditorSessionParticipant";
import { DmnRenderParticipant } from "./DmnRenderParticipant";

const EDITOR_ID = "file:///table.dmn";

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
        documentPath: () => "/table.dmn",
        documentUriString: () => EDITOR_ID,
        ...overrides,
    } as unknown as DocumentChangeEvent;
}

function createService() {
    return {
        registerSession: vi.fn(),
        display: vi.fn(),
        disposeSession: vi.fn(),
    } as unknown as DmnModelerService;
}

const notifier = { logInfo: vi.fn() } as unknown as VsCodeNotifier;

describe("DmnRenderParticipant", () => {
    it("registers the modeler session on resolve", () => {
        const service = createService();
        const { context } = createContext();

        new DmnRenderParticipant(service, notifier).onResolve(context);

        expect(service.registerSession).toHaveBeenCalledWith(EDITOR_ID);
    });

    it("re-renders on a matching .dmn content change", () => {
        const service = createService();
        const { context, captured } = createContext();
        new DmnRenderParticipant(service, notifier).onResolve(context);

        captured.documentChange?.(documentEvent({}));

        expect(service.display).toHaveBeenCalledWith(EDITOR_ID);
    });

    it("ignores changes to other documents or non-.dmn files", () => {
        const service = createService();
        const { context, captured } = createContext();
        new DmnRenderParticipant(service, notifier).onResolve(context);

        captured.documentChange?.(documentEvent({ documentUriString: () => "file:///other.dmn" }));
        captured.documentChange?.(documentEvent({ documentPath: () => "/table.bpmn" }));
        captured.documentChange?.(documentEvent({ hasContentChanges: () => false }));

        expect(service.display).not.toHaveBeenCalled();
    });

    it("disposes the session on teardown", () => {
        const service = createService();
        const { context, captured } = createContext();
        new DmnRenderParticipant(service, notifier).onResolve(context);

        captured.dispose?.();

        expect(service.disposeSession).toHaveBeenCalledWith(EDITOR_ID);
    });
});
