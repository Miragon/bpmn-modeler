import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactService } from "../../../shared/service/ArtifactService";
import { BpmnLintConfigLocator } from "../../../shared/service/BpmnLintConfigLocator";
import { createTestHost } from "../../../testing";
import { BpmnLintConfigService } from "../service/BpmnLintConfigService";
import { BpmnlintParticipant } from "./BpmnlintParticipant";

const PATH = "/work/diagram.bpmn";

// The lint service needs a lint runner and diagnostics the kit does not fake;
// casting through a `Pick` keeps the stubbed methods type-checked.
function createServices(lintMode: "external" | "in-page" = "external") {
    const host = createTestHost();
    const lintSvc = {
        setBpmnlintConfig: vi.fn(),
        clearDiagnostics: vi.fn(),
        getLintMode: vi.fn().mockReturnValue(lintMode),
    } as Pick<
        BpmnLintConfigService,
        "setBpmnlintConfig" | "clearDiagnostics" | "getLintMode"
    > as BpmnLintConfigService;
    const locator = new BpmnLintConfigLocator(
        host.workspace,
        host.settings,
        new ArtifactService(host.workspace, host.settings),
    );
    host.statusBar.showBpmnlintActive("/work/.bpmnlintrc");
    const participant = new BpmnlintParticipant(lintSvc, locator, host.statusBar, host.notifier);
    return { host, lintSvc, locator, participant };
}

describe("BpmnlintParticipant", () => {
    it("re-lints when the configFolder or linting.enabled setting changes, but not on others", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant], { focused: false });

        editor.changeSetting("miragon.bpmnModeler.language");
        expect(lintSvc.setBpmnlintConfig).not.toHaveBeenCalled();

        editor.changeSetting("miragon.bpmnModeler.configFolder");
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledWith(editor.id, false);

        editor.changeSetting("miragon.bpmnModeler.linting.enabled");
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledTimes(2);
    });

    it("watches the .bpmnlintrc until the session closes", async () => {
        const { host, participant } = createServices();
        const editor = await host.openSession(PATH, [participant]);
        const [watcher] = host.workspace.watchers;
        expect(watcher.glob).toBe("**/.bpmnlintrc");
        expect(watcher.disposed).toBe(false);

        editor.dispose();

        expect(watcher.disposed).toBe(true);
    });

    it("gates the watcher's status-bar reflection on editor focus", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant], { focused: false });
        const [watcher] = host.workspace.watchers;

        watcher.handlers.onChange?.("/work/.bpmnlintrc");
        expect(lintSvc.setBpmnlintConfig).toHaveBeenLastCalledWith(editor.id, false);

        editor.becomeActive();
        watcher.handlers.onChange?.("/work/.bpmnlintrc");
        expect(lintSvc.setBpmnlintConfig).toHaveBeenLastCalledWith(editor.id, true);
    });

    it("surfaces watcher setup errors to the user", async () => {
        const { host, locator, participant } = createServices();
        vi.spyOn(locator, "createWatcher").mockResolvedValue({
            disposables: [],
            errors: [new Error("no workspace")],
        });

        await host.openSession(PATH, [participant]);

        expect(host.notifier.errors).toEqual(["no workspace"]);
        expect(host.notifier.logged("error")).toEqual(["no workspace"]);
    });

    it("clears the status item and the diagnostics when the session is disposed", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant]);
        expect(host.statusBar.bpmnlint.state).toBe("active");

        editor.dispose();

        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
        expect(lintSvc.clearDiagnostics).toHaveBeenCalledWith(editor.id);
    });

    it("re-arms the watcher and re-pushes the lint config on a re-seed", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant]);

        await host.reseedSession(editor.id);

        expect(host.workspace.watchers.map(({ disposed }) => disposed)).toEqual([true, false]);
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledExactlyOnceWith(editor.id, true);
    });

    describe("document-change re-lint (debounced), gated by lint mode", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it("re-lints after the debounce when the editor is on the external path", async () => {
            const { host, lintSvc, participant } = createServices("external");
            const editor = await host.openSession(PATH, [participant], { focused: false });

            editor.changeDocument("<bpmn:definitions />");

            expect(lintSvc.setBpmnlintConfig).not.toHaveBeenCalled();
            vi.advanceTimersByTime(400);
            expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledWith(editor.id, false);
        });

        it("does not re-lint on document change when the editor is in-page", async () => {
            const { host, lintSvc, participant } = createServices("in-page");
            const editor = await host.openSession(PATH, [participant]);

            editor.changeDocument("<bpmn:definitions />");
            vi.advanceTimersByTime(400);

            expect(lintSvc.setBpmnlintConfig).not.toHaveBeenCalled();
        });
    });

    it("tracks editor focus: re-discovers on activate, hides on blur", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant], { focused: false });

        editor.becomeActive();
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledWith(editor.id);
        expect(host.statusBar.bpmnlint.state).toBe("active");

        editor.loseFocus();
        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
    });

    it("stops tracking focus after the session closes", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant], { focused: false });
        editor.dispose();

        editor.becomeActive();

        expect(lintSvc.setBpmnlintConfig).not.toHaveBeenCalled();
    });
});
