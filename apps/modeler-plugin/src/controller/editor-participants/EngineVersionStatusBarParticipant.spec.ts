import { describe, expect, it, vi } from "vitest";

import { VsCodeDocument } from "../../infrastructure/VsCodeDocument";
import { VsCodeStatusBar } from "../../infrastructure/VsCodeStatusBar";
import { EditorSessionContext } from "../editor-session/EditorSessionParticipant";
import { EngineVersionStatusBarParticipant } from "./EngineVersionStatusBarParticipant";

const EDITOR_ID = "file:///diagram.bpmn";
const C8_XML = '<bpmn:definitions modeler:executionPlatformVersion="8.7.0"></bpmn:definitions>';

/**
 * Context double with a mutable `panel.active` and captured view-state callback,
 * so a test can flip focus and re-fire the listener.
 */
function createContext(active: boolean) {
    const captured: { viewState?: () => void } = {};
    const panel = {
        active,
        onDidChangeViewState: vi.fn((cb: () => void) => {
            captured.viewState = cb;
            return { dispose: vi.fn() };
        }),
    };
    const addDisposable = vi.fn();
    const dispose: { cb?: () => void } = {};
    const context = {
        editorId: EDITOR_ID,
        panel,
        onDocumentChange: vi.fn(),
        onSettingChange: vi.fn(),
        onDispose: (cb: () => void) => void (dispose.cb = cb),
        addDisposable,
    } as unknown as EditorSessionContext;
    return { context, panel, captured, addDisposable, dispose };
}

function createStatusBar() {
    return {
        showEngineVersion: vi.fn(),
        hideEngineVersion: vi.fn(),
    } as unknown as VsCodeStatusBar;
}

function createDocument(content: string) {
    return { getContent: () => content } as unknown as VsCodeDocument;
}

describe("EngineVersionStatusBarParticipant", () => {
    it("registers and tracks the view-state subscription in the session bag", () => {
        const { context, panel, addDisposable } = createContext(false);

        new EngineVersionStatusBarParticipant(createStatusBar(), createDocument(C8_XML)).onResolve(
            context,
        );

        expect(panel.onDidChangeViewState).toHaveBeenCalledTimes(1);
        expect(addDisposable).toHaveBeenCalledTimes(1);
    });

    it("shows the engine version when the panel is active", () => {
        const statusBar = createStatusBar();
        const { context, captured } = createContext(true);

        new EngineVersionStatusBarParticipant(statusBar, createDocument(C8_XML)).onResolve(context);
        captured.viewState?.();

        expect(statusBar.showEngineVersion).toHaveBeenCalledWith("c8", "8.7.0");
    });

    it("hides the engine version when the panel is inactive", () => {
        const statusBar = createStatusBar();
        const { context, captured } = createContext(false);

        new EngineVersionStatusBarParticipant(statusBar, createDocument(C8_XML)).onResolve(context);
        captured.viewState?.();

        expect(statusBar.hideEngineVersion).toHaveBeenCalled();
        expect(statusBar.showEngineVersion).not.toHaveBeenCalled();
    });

    it("hides the engine version on teardown", () => {
        const statusBar = createStatusBar();
        const { context, dispose } = createContext(true);

        new EngineVersionStatusBarParticipant(statusBar, createDocument(C8_XML)).onResolve(context);
        dispose.cb?.();

        expect(statusBar.hideEngineVersion).toHaveBeenCalled();
    });
});
