import { afterEach, describe, expect, it, vi } from "vitest";

import { ElementTemplatesQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost, FakeEditorHandle } from "../../../testing";
import { elementTemplatesStatusView } from "../domain/elementTemplatesStatusView";
import { BpmnElementTemplatesService } from "./BpmnElementTemplatesService";

const ROOT_TEMPLATES = "/work/.camunda/element-templates";
const NESTED_TEMPLATES = "/work/sub/.camunda/element-templates";
const FOLDER_A_TEMPLATES = "/a/.camunda/element-templates";
const FOLDER_B_TEMPLATES = "/b/.camunda/element-templates";
const TEMPLATES_LOADING = elementTemplatesStatusView({ state: "loading" });
const templatesReady = (count: number) => elementTemplatesStatusView({ state: "ready", count })!;

/**
 * Wires the service to the test host over an in-memory template tree: `dirFiles`
 * maps a template directory to its `.json` files, `fileContents` a file to its
 * JSON text.
 */
function createService(options: { marketplace?: boolean } = {}) {
    const dirFiles = new Map<string, string[]>([[ROOT_TEMPLATES, []]]);
    const fileContents = new Map<string, string>();
    const host = createTestHost();
    const editor = host.openEditor("/work/diagram.bpmn");
    const secondEditor = host.openEditor("/work/other.bpmn");
    const nestedEditor = host.openEditor("/work/sub/nested.bpmn");
    const artifactSvc = {
        getTemplateDirs: vi.fn(async (documentDir: string) =>
            [...dirFiles.keys()].filter((dir) =>
                documentDir.startsWith(dir.replace("/.camunda/element-templates", "")),
            ),
        ),
        readDirectory: vi.fn(async (dir: string) => [...(dirFiles.get(dir) ?? [])]),
        readFile: vi.fn(async (path: string) => {
            const content = fileContents.get(path);
            if (content === undefined) throw new Error(`ENOENT ${path}`);
            return content;
        }),
    };
    const marketplaceSvc = { getCachedTemplatePaths: vi.fn().mockResolvedValue([]) };

    const service = new BpmnElementTemplatesService(
        host.store,
        host.documents,
        artifactSvc as never,
        host.statusBar,
        host.notifier,
        options.marketplace === false ? undefined : marketplaceSvc,
    );

    const addTemplate = (dir: string, file: string, template: unknown) => {
        const path = `${dir}/${file}`;
        dirFiles.set(dir, [...(dirFiles.get(dir) ?? []), path]);
        fileContents.set(path, JSON.stringify(template));
        return path;
    };

    return {
        service,
        host,
        editor,
        secondEditor,
        nestedEditor,
        artifactSvc,
        marketplaceSvc,
        fileContents,
        addTemplate,
    };
}

function postedTemplates(editor: FakeEditorHandle): object[][] {
    return editor
        .postedOfType<ElementTemplatesQuery>("ElementTemplatesQuery")
        .map((query) => query.elementTemplates);
}

function postedNames(editor: FakeEditorHandle): string[] {
    const posted = postedTemplates(editor);
    const templates = posted[posted.length - 1] as { name: string }[];
    return templates.map((template) => template.name);
}

describe("BpmnElementTemplatesService.setElementTemplates", () => {
    it("loads, name-sorts, and posts templates, then reports readiness", async () => {
        const { service, host, editor, addTemplate } = createService();
        addTemplate(ROOT_TEMPLATES, "b.json", { name: "Zebra" });
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });

        const result = await service.setElementTemplates(editor.id);

        expect(result).toBe(true);
        expect(postedNames(editor)).toEqual(["Apple", "Zebra"]);
        expect(host.statusBar.views.elementTemplates).toEqual(templatesReady(2));
        expect(host.notifier.logged("info")).toEqual([
            "2 element template(s) loaded from 2 file(s).",
        ]);
    });

    it("merges cached marketplace templates with workspace-local ones, name-sorted", async () => {
        const { service, editor, addTemplate, artifactSvc, marketplaceSvc, fileContents } =
            createService();
        const local = addTemplate(ROOT_TEMPLATES, "local.json", { name: "Local" });
        marketplaceSvc.getCachedTemplatePaths.mockResolvedValue(["/cache/remote.json"]);
        fileContents.set("/cache/remote.json", JSON.stringify([{ name: "Aremote" }]));

        const result = await service.setElementTemplates(editor.id);

        expect(result).toBe(true);
        expect(artifactSvc.readFile).toHaveBeenCalledWith(local);
        expect(artifactSvc.readFile).toHaveBeenCalledWith("/cache/remote.json");
        expect(postedNames(editor)).toEqual(["Aremote", "Local"]);
    });

    it("works without a marketplace service (workspace-only host)", async () => {
        const { service, editor, addTemplate } = createService({ marketplace: false });
        addTemplate(ROOT_TEMPLATES, "local.json", { name: "Local" });

        const result = await service.setElementTemplates(editor.id);

        expect(result).toBe(true);
        expect(postedTemplates(editor)).toEqual([[{ name: "Local" }]]);
    });

    it("skips and logs a file that fails to parse, keeping the rest", async () => {
        const { service, host, editor, addTemplate, fileContents } = createService();
        addTemplate(ROOT_TEMPLATES, "ok.json", [{ name: "Good" }]);
        const broken = addTemplate(ROOT_TEMPLATES, "broken.json", {});
        fileContents.set(broken, "{ not json");

        const result = await service.setElementTemplates(editor.id);

        expect(result).toBe(true);
        expect(host.notifier.logged("error")).toEqual([
            expect.stringContaining(`Failed to parse element template "${broken}"`),
        ]);
        expect(postedNames(editor)).toEqual(["Good"]);
    });

    it("loads an empty template file as no templates, without an error", async () => {
        const { service, host, editor, addTemplate, fileContents } = createService();
        addTemplate(ROOT_TEMPLATES, "ok.json", { name: "Good" });
        fileContents.set(addTemplate(ROOT_TEMPLATES, "new-template.json", {}), "");

        await service.setElementTemplates(editor.id);

        expect(host.notifier.logged("error")).toEqual([]);
        expect(postedNames(editor)).toEqual(["Good"]);
    });

    it("does not log readiness info when there are no template files", async () => {
        const { service, host, editor } = createService();

        const result = await service.setElementTemplates(editor.id);

        expect(result).toBe(true);
        expect(host.statusBar.views.elementTemplates).toEqual(templatesReady(0));
        expect(host.notifier.logged("info")).toEqual([]);
    });

    it("hides the status and notifies when the post is rejected by the webview", async () => {
        const { service, host, editor } = createService();
        vi.spyOn(editor, "postMessage").mockResolvedValue(false);

        const result = await service.setElementTemplates(editor.id);

        expect(result).toBe(false);
        expect(host.statusBar.views.elementTemplates).toBeUndefined();
        expect(host.notifier.errors).toEqual([
            "A problem occurred while loading element templates.\nSetting the `elementTemplates` failed.",
        ]);
    });

    it("hides the status and notifies when loading throws", async () => {
        const { service, host, editor, artifactSvc } = createService();
        host.statusBar.show("elementTemplates", templatesReady(3));
        artifactSvc.getTemplateDirs.mockRejectedValue(new Error("fs blew up"));

        const result = await service.setElementTemplates(editor.id);

        expect(result).toBe(false);
        expect(host.statusBar.views.elementTemplates).toBeUndefined();
        expect(host.notifier.errors).toEqual([
            "A problem occurred while loading element templates.\nfs blew up",
        ]);
    });

    it("skips quietly for a disposed editor without touching the status bar or webview", async () => {
        const { service, host, editor, secondEditor, nestedEditor } = createService();
        host.statusBar.show("elementTemplates", templatesReady(3));

        const result = await service.setElementTemplates("file:///work/closed.bpmn");

        expect(result).toBe(false);
        expect(host.notifier.errors).toEqual([]);
        expect([...editor.posted, ...secondEditor.posted, ...nestedEditor.posted]).toEqual([]);
        expect(host.statusBar.views.elementTemplates).toEqual(templatesReady(3));
        expect(host.notifier.logged("debug")).toHaveLength(1);
    });

    it("keeps the spinner while another editor's templates still load", async () => {
        const { service, host, artifactSvc, addTemplate } = createService({ marketplace: false });
        addTemplate(FOLDER_A_TEMPLATES, "apple.json", { name: "Apple" });
        addTemplate(FOLDER_B_TEMPLATES, "banana.json", { name: "Banana" });
        addTemplate(FOLDER_B_TEMPLATES, "cherry.json", { name: "Cherry" });
        const editorInA = host.openEditor("/a/order.bpmn");
        const editorInB = host.openEditor("/b/invoice.bpmn");
        const readDirectory = artifactSvc.readDirectory.getMockImplementation()!;
        const heldReads = new Map<string, () => void>();
        artifactSvc.readDirectory.mockImplementation(
            (dir: string) =>
                new Promise((resolve) => heldReads.set(dir, () => resolve(readDirectory(dir)))),
        );

        const loadInA = service.setElementTemplates(editorInA.id);
        const loadInB = service.setElementTemplates(editorInB.id);
        await vi.waitFor(() => expect(heldReads.size).toBe(2));
        expect(host.statusBar.views.elementTemplates).toEqual(TEMPLATES_LOADING);

        heldReads.get(FOLDER_A_TEMPLATES)!();
        await loadInA;
        expect(host.statusBar.views.elementTemplates).toEqual(TEMPLATES_LOADING);

        heldReads.get(FOLDER_B_TEMPLATES)!();
        await loadInB;
        expect(host.statusBar.views.elementTemplates).toEqual(templatesReady(2));
    });

    it("ends the spinner of a disk load superseded mid-read", async () => {
        const { service, host, editor, secondEditor, artifactSvc, addTemplate } = createService({
            marketplace: false,
        });
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        const readDirectory = artifactSvc.readDirectory.getMockImplementation()!;
        let releaseFirstRead: (() => void) | undefined;
        artifactSvc.readDirectory.mockImplementationOnce(
            (dir: string) =>
                new Promise((resolve) => {
                    releaseFirstRead = () => resolve(readDirectory(dir));
                }),
        );

        const supersededLoad = service.setElementTemplates(editor.id);
        await vi.waitFor(() => expect(releaseFirstRead).toBeDefined());
        service.releaseEditor(editor.id);
        releaseFirstRead!();

        await expect(supersededLoad).resolves.toBe(false);
        expect(host.statusBar.views.elementTemplates).toBeUndefined();
        await service.setElementTemplates(secondEditor.id);
        expect(host.statusBar.views.elementTemplates).toEqual(templatesReady(1));
    });

    it("ends the spinner of a disk load that throws mid-read", async () => {
        const { service, host, editor, artifactSvc, addTemplate } = createService({
            marketplace: false,
        });
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        artifactSvc.readDirectory.mockRejectedValueOnce(new Error("EACCES"));

        await expect(service.setElementTemplates(editor.id)).resolves.toBe(false);
        expect(host.statusBar.views.elementTemplates).toBeUndefined();
        await service.setElementTemplates(editor.id);
        expect(host.statusBar.views.elementTemplates).toEqual(templatesReady(1));
    });

    it("does not notify when the editor is disposed mid-load", async () => {
        const { service, host, editor, artifactSvc } = createService();
        // Editor is present at entry but gone by the time the awaited read throws.
        artifactSvc.getTemplateDirs.mockImplementation(async () => {
            host.store.unregister(editor.id, editor);
            throw new Error("read raced a close");
        });

        const result = await service.setElementTemplates(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.errors).toEqual([]);
        expect(host.notifier.logged("debug")).toHaveLength(1);
    });
});

describe("BpmnElementTemplatesService template cache", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("serves a second editor in the same directory without reading from disk or flashing the status bar", async () => {
        const { service, host, editor, secondEditor, addTemplate, artifactSvc, marketplaceSvc } =
            createService();
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        await service.setElementTemplates(editor.id);
        host.statusBar.hide("elementTemplates");
        vi.clearAllMocks();

        await service.setElementTemplates(secondEditor.id);

        expect(artifactSvc.readDirectory).not.toHaveBeenCalled();
        expect(artifactSvc.readFile).not.toHaveBeenCalled();
        expect(marketplaceSvc.getCachedTemplatePaths).not.toHaveBeenCalled();
        expect(host.statusBar.views.elementTemplates).toBeUndefined();
        expect(postedNames(secondEditor)).toEqual(["Apple"]);
    });

    it("reads only the directories a nested editor adds", async () => {
        const { service, editor, nestedEditor, addTemplate, artifactSvc } = createService();
        addTemplate(ROOT_TEMPLATES, "root.json", { name: "Root" });
        addTemplate(NESTED_TEMPLATES, "near.json", { name: "Near" });
        await service.setElementTemplates(editor.id);
        vi.clearAllMocks();

        await service.setElementTemplates(nestedEditor.id);

        expect(artifactSvc.readDirectory.mock.calls).toEqual([[NESTED_TEMPLATES, ".json"]]);
        expect(postedNames(nestedEditor)).toEqual(["Near", "Root"]);
    });

    it("shares one load between concurrent editors", async () => {
        const { service, editor, secondEditor, addTemplate, artifactSvc } = createService();
        const file = addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });

        await Promise.all([
            service.setElementTemplates(editor.id),
            service.setElementTemplates(secondEditor.id),
        ]);

        expect(artifactSvc.readFile.mock.calls.filter(([path]) => path === file)).toHaveLength(1);
    });

    it("coalesces watcher refreshes into one re-read that reaches every editor", async () => {
        vi.useFakeTimers();
        const { service, editor, secondEditor, addTemplate, artifactSvc, fileContents } =
            createService();
        const file = addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        await service.setElementTemplates(editor.id);
        await service.setElementTemplates(secondEditor.id);
        fileContents.set(file, JSON.stringify({ name: "Avocado" }));
        vi.clearAllMocks();

        service.refreshElementTemplates(editor.id);
        service.refreshElementTemplates(secondEditor.id);
        await vi.advanceTimersByTimeAsync(150);

        expect(artifactSvc.readFile.mock.calls.filter(([path]) => path === file)).toHaveLength(1);
        expect(postedTemplates(editor)).toEqual([[{ name: "Apple" }], [{ name: "Avocado" }]]);
        expect(postedTemplates(secondEditor)).toEqual([[{ name: "Apple" }], [{ name: "Avocado" }]]);
    });

    it("re-reads only marketplace templates on a marketplace reload", async () => {
        const {
            service,
            editor,
            secondEditor,
            nestedEditor,
            addTemplate,
            artifactSvc,
            marketplaceSvc,
            fileContents,
        } = createService();
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        marketplaceSvc.getCachedTemplatePaths.mockResolvedValue(["/cache/remote.json"]);
        fileContents.set("/cache/remote.json", JSON.stringify({ name: "Remote" }));
        await service.setElementTemplates(editor.id);
        vi.clearAllMocks();

        await service.reloadMarketplaceTemplates();

        expect(artifactSvc.readDirectory).not.toHaveBeenCalled();
        expect(artifactSvc.readFile.mock.calls).toEqual([["/cache/remote.json"]]);
        expect(postedTemplates(editor)).toHaveLength(2);
        expect([...secondEditor.posted, ...nestedEditor.posted]).toEqual([]);
    });

    it("reloads only editors that requested templates, and none once released", async () => {
        const { service, editor, secondEditor, nestedEditor } = createService();
        await service.setElementTemplates(editor.id);
        await service.setElementTemplates(secondEditor.id);
        service.releaseEditor(secondEditor.id);

        await service.reloadMarketplaceTemplates();

        expect(postedTemplates(editor)).toHaveLength(2);
        expect(postedTemplates(secondEditor)).toHaveLength(1);
        expect(nestedEditor.posted).toEqual([]);
    });

    it("does not post templates of a request that a newer one superseded", async () => {
        const { service, editor, addTemplate, artifactSvc } = createService();
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        let releaseFirstLookup!: () => void;
        artifactSvc.getTemplateDirs.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseFirstLookup = () => resolve([ROOT_TEMPLATES]);
                }),
        );

        const superseded = service.setElementTemplates(editor.id);
        await service.setElementTemplates(editor.id);
        releaseFirstLookup();

        await expect(superseded).resolves.toBe(false);
        expect(editor.posted).toHaveLength(1);
    });

    it("does not keep a failed directory load", async () => {
        const { service, host, editor, addTemplate, artifactSvc } = createService();
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        artifactSvc.readDirectory.mockRejectedValueOnce(new Error("EACCES"));

        await expect(service.setElementTemplates(editor.id)).resolves.toBe(false);
        expect(host.notifier.errors).toHaveLength(1);

        await expect(service.setElementTemplates(editor.id)).resolves.toBe(true);
        expect(artifactSvc.readDirectory).toHaveBeenCalledTimes(2);
    });

    it("re-reads a directory once no open editor watches it any more", async () => {
        const { service, editor, secondEditor, addTemplate, artifactSvc, marketplaceSvc } =
            createService();
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        await service.setElementTemplates(editor.id);
        await service.setElementTemplates(secondEditor.id);

        service.releaseEditor(editor.id);
        vi.clearAllMocks();
        await service.setElementTemplates(editor.id);
        expect(artifactSvc.readDirectory).not.toHaveBeenCalled();

        service.releaseEditor(editor.id);
        service.releaseEditor(secondEditor.id);
        await service.setElementTemplates(editor.id);
        expect(artifactSvc.readDirectory).toHaveBeenCalledOnce();
        expect(marketplaceSvc.getCachedTemplatePaths).toHaveBeenCalledOnce();
    });
});
