import { describe, expect, it, vi } from "vitest";

import { SettingChange } from "@miragon/bpmn-modeler-core";
import { BpmnLintConfigLocator, WatcherResult } from "@miragon/bpmn-modeler-core";
import { BpmnLintConfigService } from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { VsCodeStatusBar } from "../../../../shared/infrastructure/VsCodeStatusBar";
import { EditorSessionContext } from "../../../editor-session/EditorSessionParticipant";
import { BpmnlintParticipant } from "./BpmnlintParticipant";

const EDITOR_ID = "file:///diagram.bpmn";

function createContext() {
    const captured: {
        settingChange?: (event: SettingChange, id: string) => void;
        dispose?: () => void;
        viewState?: () => void;
    } = {};
    const addDisposable = vi.fn();
    const viewStateSubscription = { dispose: vi.fn() };
    const panel = {
        active: false,
        onDidChangeViewState: (cb: () => void) => {
            captured.viewState = cb;
            return viewStateSubscription;
        },
    };
    const context: EditorSessionContext = {
        editorId: EDITOR_ID,
        panel: panel as never,
        onDocumentChange: vi.fn(),
        onSettingChange: (cb) => void (captured.settingChange = cb),
        onDispose: (cb) => void (captured.dispose = cb),
        addDisposable,
    };
    return { context, captured, addDisposable, panel, viewStateSubscription };
}

function settingChange(affected: string): SettingChange {
    return { affectsConfiguration: (section: string) => section === affected };
}

// The collaborators are classes with private fields, so a structural stub can't
// be assigned to them directly — but casting through a `Pick` of the methods the
// participant actually calls stays type-checked (a typo in a method name fails to
// compile) and documents the seam, without a blanket `as unknown as`.
function createServices(watcher: WatcherResult) {
    const lintSvc = {
        setBpmnlintConfig: vi.fn(),
        clearDiagnostics: vi.fn(),
    } as Pick<BpmnLintConfigService, "setBpmnlintConfig" | "clearDiagnostics"> as BpmnLintConfigService;
    const locator = {
        createWatcher: vi.fn().mockResolvedValue(watcher),
    } as Pick<BpmnLintConfigLocator, "createWatcher"> as BpmnLintConfigLocator;
    const statusBar = {
        hideBpmnlintStatus: vi.fn(),
    } as Pick<VsCodeStatusBar, "hideBpmnlintStatus"> as VsCodeStatusBar;
    const notifier = {
        showError: vi.fn(),
        logError: vi.fn(),
    } as Pick<VsCodeNotifier, "showError" | "logError"> as VsCodeNotifier;
    return { lintSvc, locator, statusBar, notifier };
}

describe("BpmnlintParticipant", () => {
    it("re-discovers the config only when the configFolder setting changes", async () => {
        const { lintSvc, locator, statusBar, notifier } = createServices({
            disposables: [],
            errors: [],
        });
        const { context, captured } = createContext();

        await new BpmnlintParticipant(lintSvc, locator, statusBar, notifier).onResolve(context);

        captured.settingChange?.(settingChange("miragon.bpmnModeler.language"), EDITOR_ID);
        expect(lintSvc.setBpmnlintConfig).not.toHaveBeenCalled();

        captured.settingChange?.(settingChange("miragon.bpmnModeler.configFolder"), EDITOR_ID);
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledWith(EDITOR_ID, false);
    });

    it("joins watcher disposables to the session bag", async () => {
        const disposable = { dispose: vi.fn() };
        const { lintSvc, locator, statusBar, notifier } = createServices({
            disposables: [disposable],
            errors: [],
        });
        const { context, addDisposable } = createContext();

        await new BpmnlintParticipant(lintSvc, locator, statusBar, notifier).onResolve(context);

        expect(locator.createWatcher).toHaveBeenCalledWith(
            EDITOR_ID,
            expect.objectContaining({ setBpmnlintConfig: expect.any(Function) }),
        );
        expect(addDisposable).toHaveBeenCalledWith(disposable);
    });

    it("gates the watcher's status-bar reflection on editor focus", async () => {
        const { lintSvc, locator, statusBar, notifier } = createServices({
            disposables: [],
            errors: [],
        });
        const { context, panel } = createContext();

        await new BpmnlintParticipant(lintSvc, locator, statusBar, notifier).onResolve(context);

        const watcherTarget = (locator.createWatcher as ReturnType<typeof vi.fn>).mock
            .calls[0][1] as { setBpmnlintConfig: (id: string) => unknown };

        panel.active = false;
        watcherTarget.setBpmnlintConfig(EDITOR_ID);
        expect(lintSvc.setBpmnlintConfig).toHaveBeenLastCalledWith(EDITOR_ID, false);

        panel.active = true;
        watcherTarget.setBpmnlintConfig(EDITOR_ID);
        expect(lintSvc.setBpmnlintConfig).toHaveBeenLastCalledWith(EDITOR_ID, true);
    });

    it("surfaces watcher setup errors to the user", async () => {
        const error = new Error("no workspace");
        const { lintSvc, locator, statusBar, notifier } = createServices({
            disposables: [],
            errors: [error],
        });
        const { context } = createContext();

        await new BpmnlintParticipant(lintSvc, locator, statusBar, notifier).onResolve(context);

        expect(notifier.showError).toHaveBeenCalledWith("no workspace");
        expect(notifier.logError).toHaveBeenCalledWith(error);
    });

    it("clears the status item and the diagnostics when the session is disposed", async () => {
        const { lintSvc, locator, statusBar, notifier } = createServices({
            disposables: [],
            errors: [],
        });
        const { context, captured } = createContext();

        await new BpmnlintParticipant(lintSvc, locator, statusBar, notifier).onResolve(context);

        expect(statusBar.hideBpmnlintStatus).not.toHaveBeenCalled();
        captured.dispose?.();
        expect(statusBar.hideBpmnlintStatus).toHaveBeenCalledOnce();
        expect(lintSvc.clearDiagnostics).toHaveBeenCalledWith(EDITOR_ID);
    });

    it("tracks editor focus: re-discovers on activate, hides on blur", async () => {
        const { lintSvc, locator, statusBar, notifier } = createServices({
            disposables: [],
            errors: [],
        });
        const { context, captured, panel, addDisposable, viewStateSubscription } = createContext();

        await new BpmnlintParticipant(lintSvc, locator, statusBar, notifier).onResolve(context);
        // The view-state subscription must die with the session.
        expect(addDisposable).toHaveBeenCalledWith(viewStateSubscription);

        panel.active = true;
        captured.viewState?.();
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledWith(EDITOR_ID);
        expect(statusBar.hideBpmnlintStatus).not.toHaveBeenCalled();

        panel.active = false;
        captured.viewState?.();
        expect(statusBar.hideBpmnlintStatus).toHaveBeenCalledOnce();
    });
});
