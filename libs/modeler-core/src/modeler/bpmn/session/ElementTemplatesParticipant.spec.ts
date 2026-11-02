import { describe, expect, it, vi } from "vitest";

import { ElementTemplatesQuery } from "@miragon/bpmn-modeler-shared";

import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { createTestHost } from "../../../testing";
import { BpmnElementTemplatesService } from "../service/BpmnElementTemplatesService";
import { ElementTemplatesParticipant } from "./ElementTemplatesParticipant";

const PATH = "/work/diagram.bpmn";

function createServices() {
    const host = createTestHost();
    const artifacts = new ArtifactService(host.workspace, host.settings);
    const templates = new BpmnElementTemplatesService(
        host.store,
        host.documents,
        artifacts,
        host.statusBar,
        host.notifier,
    );
    const refresh = vi.spyOn(templates, "refreshElementTemplates").mockImplementation(() => {});
    const release = vi.spyOn(templates, "releaseEditor");
    const participant = new ElementTemplatesParticipant(templates, artifacts, host.notifier);
    return { host, artifacts, participant, refresh, release };
}

function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ElementTemplatesParticipant", () => {
    it("re-arms the watcher and refreshes templates only when the configFolder setting changes", async () => {
        const { host, participant, refresh } = createServices();
        const editor = await host.openSession(PATH, [participant]);

        editor.changeSetting("language");
        await settle();
        expect(refresh).not.toHaveBeenCalled();
        expect(host.workspace.watchers).toHaveLength(1);

        host.settings.values.configFolder = ".config";
        editor.changeSetting("configFolder");
        await settle();

        expect(refresh).toHaveBeenCalledWith(editor.id);
        expect(host.workspace.watchers.map(({ disposed }) => disposed)).toEqual([true, false]);

        refresh.mockClear();
        await host.workspace.writeFile("/work/.camunda/element-templates/a.json", "[]");
        expect(refresh).not.toHaveBeenCalled();
        await host.workspace.writeFile("/work/.config/element-templates/a.json", "[]");
        expect(refresh).toHaveBeenCalledExactlyOnceWith(editor.id);
    });

    it("disposes the watcher and releases the editor's templates when the session closes", async () => {
        const { host, participant, release } = createServices();
        const editor = await host.openSession(PATH, [participant]);
        const [watcher] = host.workspace.watchers;
        expect(watcher.disposed).toBe(false);

        editor.dispose();

        expect(watcher.disposed).toBe(true);
        expect(release).toHaveBeenCalledWith(editor.id);
    });

    it("surfaces watcher setup errors to the user", async () => {
        const { host, artifacts, participant } = createServices();
        const noWorkspace = new Error("no workspace");
        vi.spyOn(artifacts, "createWatcher").mockResolvedValue({
            disposables: [],
            errors: [noWorkspace],
        });

        await host.openSession(PATH, [participant]);

        expect(host.notifier.errors).toEqual(["no workspace"]);
        expect(host.notifier.logged("error")).toEqual([noWorkspace.stack]);
    });

    it("re-arms the watcher and pushes the templates again on a re-seed", async () => {
        const { host, participant } = createServices();
        const editor = await host.openSession(PATH, [participant]);
        expect(editor.postedOfType("ElementTemplatesQuery")).toEqual([]);

        await host.reseedSession(editor.id);

        expect(host.workspace.watchers.map(({ disposed }) => disposed)).toEqual([true, false]);
        expect(editor.postedOfType("ElementTemplatesQuery")).toEqual([
            new ElementTemplatesQuery([]),
        ]);
    });
});
