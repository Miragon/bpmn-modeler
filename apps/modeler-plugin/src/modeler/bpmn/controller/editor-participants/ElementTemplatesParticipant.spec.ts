import { describe, expect, it, vi } from "vitest";

import { SettingChange } from "../../../../shared/domain/EditorSession";
import { ArtifactService, WatcherResult } from "../../../../shared/service/ArtifactService";
import { BpmnElementTemplatesService } from "../../service/BpmnElementTemplatesService";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { EditorSessionContext } from "../../../editor-session/EditorSessionParticipant";
import { ElementTemplatesParticipant } from "./ElementTemplatesParticipant";

const EDITOR_ID = "file:///diagram.bpmn";

function createContext() {
    const captured: { settingChange?: (event: SettingChange, id: string) => void } = {};
    const addDisposable = vi.fn();
    const context: EditorSessionContext = {
        editorId: EDITOR_ID,
        panel: {} as never,
        onDocumentChange: vi.fn(),
        onSettingChange: (cb) => void (captured.settingChange = cb),
        onDispose: vi.fn(),
        addDisposable,
    };
    return { context, captured, addDisposable };
}

function settingChange(affected: string): SettingChange {
    return { affectsConfiguration: (section: string) => section === affected };
}

function createServices(watcher: WatcherResult) {
    const templatesSvc = { setElementTemplates: vi.fn() } as unknown as BpmnElementTemplatesService;
    const artifactSvc = {
        createWatcher: vi.fn().mockResolvedValue(watcher),
    } as unknown as ArtifactService;
    const notifier = { showError: vi.fn(), logError: vi.fn() } as unknown as VsCodeNotifier;
    return { templatesSvc, artifactSvc, notifier };
}

describe("ElementTemplatesParticipant", () => {
    it("reloads templates only when the configFolder setting changes", async () => {
        const { templatesSvc, artifactSvc, notifier } = createServices({
            disposables: [],
            errors: [],
        });
        const { context, captured } = createContext();

        await new ElementTemplatesParticipant(templatesSvc, artifactSvc, notifier).onResolve(
            context,
        );

        captured.settingChange?.(settingChange("miragon.bpmnModeler.language"), EDITOR_ID);
        expect(templatesSvc.setElementTemplates).not.toHaveBeenCalled();

        captured.settingChange?.(settingChange("miragon.bpmnModeler.configFolder"), EDITOR_ID);
        expect(templatesSvc.setElementTemplates).toHaveBeenCalledWith(EDITOR_ID);
    });

    it("joins watcher disposables to the session bag", async () => {
        const disposable = { dispose: vi.fn() };
        const { templatesSvc, artifactSvc, notifier } = createServices({
            disposables: [disposable],
            errors: [],
        });
        const { context, addDisposable } = createContext();

        await new ElementTemplatesParticipant(templatesSvc, artifactSvc, notifier).onResolve(
            context,
        );

        expect(artifactSvc.createWatcher).toHaveBeenCalledWith(EDITOR_ID, templatesSvc);
        expect(addDisposable).toHaveBeenCalledWith(disposable);
    });

    it("surfaces watcher setup errors to the user", async () => {
        const error = new Error("no workspace");
        const { templatesSvc, artifactSvc, notifier } = createServices({
            disposables: [],
            errors: [error],
        });
        const { context } = createContext();

        await new ElementTemplatesParticipant(templatesSvc, artifactSvc, notifier).onResolve(
            context,
        );

        expect(notifier.showError).toHaveBeenCalledWith("no workspace");
        expect(notifier.logError).toHaveBeenCalledWith(error);
    });
});
