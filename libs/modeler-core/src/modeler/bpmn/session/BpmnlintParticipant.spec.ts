import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusView } from "../../../kernel/domain/statusView";
import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { BpmnLintConfigLocator } from "../service/BpmnLintConfigLocator";
import { createTestHost } from "../../../testing";
import { BpmnLintConfigService } from "../service/BpmnLintConfigService";
import { BpmnlintParticipant } from "./BpmnlintParticipant";

const PATH = "/work/diagram.bpmn";
// The service decides what the slot shows; the participant only hides it on blur and close.
const LINT_STATUS: StatusView = { text: "BPMNlint", icon: "check", tone: "neutral" };

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
    host.statusBar.show("bpmnlint", LINT_STATUS);
    const participant = new BpmnlintParticipant(lintSvc, locator, host.statusBar, host.notifier);
    return { host, lintSvc, locator, participant };
}

describe("BpmnlintParticipant", () => {
    it("re-lints when the configFolder or linting.enabled setting changes, but not on others", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant], { focused: false });

        editor.changeSetting("language");
        expect(lintSvc.setBpmnlintConfig).not.toHaveBeenCalled();

        editor.changeSetting("configFolder");
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledWith(editor.id);

        editor.changeSetting("linting.enabled");
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledTimes(2);
    });

    it("watches the .bpmnlintrc until the session closes", async () => {
        const { host, participant } = createServices();
        const editor = await host.openSession(PATH, [participant]);
        const [watcher] = host.workspace.watchers;
        expect(watcher.disposed).toBe(false);

        editor.dispose();

        expect(watcher.disposed).toBe(true);
    });

    it("re-lints when the .bpmnlintrc changes on disk", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant], { focused: false });

        await host.workspace.writeFile("/work/.bpmnlintrc", "{}");

        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledExactlyOnceWith(editor.id);
    });

    it("surfaces watcher setup errors to the user", async () => {
        const { host, locator, participant } = createServices();
        const noWorkspace = new Error("no workspace");
        vi.spyOn(locator, "createWatcher").mockResolvedValue({
            disposables: [],
            errors: [noWorkspace],
        });

        await host.openSession(PATH, [participant]);

        expect(host.notifier.errors).toEqual(["no workspace"]);
        expect(host.notifier.logged("error")).toEqual([noWorkspace.stack]);
    });

    it("clears the status item and the diagnostics when the session is disposed", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant]);
        expect(host.statusBar.views.bpmnlint).toBe(LINT_STATUS);

        editor.dispose();

        expect(host.statusBar.views.bpmnlint).toBeUndefined();
        expect(lintSvc.clearDiagnostics).toHaveBeenCalledWith(editor.id);
    });

    it("re-arms the watcher and re-pushes the lint config on a re-seed", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant]);

        await host.reseedSession(editor.id);

        expect(host.workspace.watchers.map(({ disposed }) => disposed)).toEqual([true, false]);
        expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledExactlyOnceWith(editor.id);
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
            expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledWith(editor.id);
        });

        it("re-lints only the editor whose document changed", async () => {
            const { host, lintSvc, participant } = createServices("external");
            await host.openSession(PATH, [participant], { focused: false });
            const other = await host.openSession("/work/other.bpmn", [participant], {
                focused: false,
            });

            other.changeDocument("<bpmn:definitions />");
            vi.advanceTimersByTime(400);

            expect(lintSvc.setBpmnlintConfig).toHaveBeenCalledExactlyOnceWith(other.id);
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
        expect(host.statusBar.views.bpmnlint).toBe(LINT_STATUS);

        editor.loseFocus();
        expect(host.statusBar.views.bpmnlint).toBeUndefined();
    });

    it("keeps the focused editor's lint status when a background editor closes", async () => {
        const { host, participant } = createServices();
        await host.openSession(PATH, [participant]);
        const background = await host.openSession("/work/other.bpmn", [participant], {
            focused: false,
        });

        background.dispose();

        expect(host.statusBar.views.bpmnlint).toBe(LINT_STATUS);
    });

    it("keeps the newly focused editor's lint status when the previous editor blurs after it", async () => {
        const { host, participant } = createServices();
        const previous = await host.openSession(PATH, [participant]);
        const next = await host.openSession("/work/other.bpmn", [participant], {
            focused: false,
        });

        next.becomeActive();
        previous.loseFocus();

        expect(host.statusBar.views.bpmnlint).toBe(LINT_STATUS);
    });

    it("stops tracking focus after the session closes", async () => {
        const { host, lintSvc, participant } = createServices();
        const editor = await host.openSession(PATH, [participant], { focused: false });
        editor.dispose();

        editor.becomeActive();

        expect(lintSvc.setBpmnlintConfig).not.toHaveBeenCalled();
    });
});
