import { afterEach, describe, expect, it, vi } from "vitest";

import { ElementTemplatesQuery, HiddenElementTemplatesQuery } from "@miragon/bpmn-modeler-shared";

import {
    templatePreferenceChange,
    type TemplateSourceRef,
} from "../../../kernel/domain/templatePreferences";

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
function createService(options: { marketplace?: boolean; switches?: boolean } = {}) {
    const dirFiles = new Map<string, string[]>([[ROOT_TEMPLATES, []]]);
    const fileContents = new Map<string, string>();
    const host = createTestHost({ folders: ["/work"] });
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
    const getCachedTemplatePaths = vi.fn().mockResolvedValue([]);
    const marketplaceSvc = {
        getCachedTemplatePaths,
        getCachedTemplateSources: vi.fn(
            async (): Promise<{ source?: TemplateSourceRef; paths: string[] }[]> => [
                { paths: await getCachedTemplatePaths() },
            ],
        ),
    };

    const service = new BpmnElementTemplatesService(
        host.store,
        host.documents,
        artifactSvc as never,
        host.statusBar,
        host.notifier,
        options.marketplace === false ? undefined : marketplaceSvc,
        options.switches
            ? { preferences: host.templatePreferences, workspace: host.workspace }
            : undefined,
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

    it("hides no template from new choices", async () => {
        const { service, editor, addTemplate } = createService();
        addTemplate(ROOT_TEMPLATES, "a.json", { id: "audit", name: "Audit" });

        await service.setElementTemplates(editor.id);

        expect(
            editor
                .postedOfType<ElementTemplatesQuery>("ElementTemplatesQuery")
                .map((query) => query.hiddenTemplates),
        ).toEqual([[]]);
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

    it("coalesces marketplace refreshes into one marketplace re-read that reaches every editor", async () => {
        vi.useFakeTimers();
        const {
            service,
            editor,
            secondEditor,
            addTemplate,
            artifactSvc,
            marketplaceSvc,
            fileContents,
        } = createService();
        addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        marketplaceSvc.getCachedTemplatePaths.mockResolvedValue(["/cache/remote.json"]);
        fileContents.set("/cache/remote.json", JSON.stringify({ name: "Remote" }));
        await service.setElementTemplates(editor.id);
        await service.setElementTemplates(secondEditor.id);
        marketplaceSvc.getCachedTemplatePaths.mockResolvedValue([]);
        vi.clearAllMocks();

        service.refreshMarketplaceTemplates(editor.id);
        service.refreshMarketplaceTemplates(secondEditor.id);
        await vi.advanceTimersByTimeAsync(150);

        expect(marketplaceSvc.getCachedTemplatePaths).toHaveBeenCalledOnce();
        expect(artifactSvc.readDirectory).not.toHaveBeenCalled();
        expect(postedNames(editor)).toEqual(["Apple"]);
        expect(postedNames(secondEditor)).toEqual(["Apple"]);
    });

    it("passes a hidden editor by without an error; shown again, it gets the change", async () => {
        vi.useFakeTimers();
        const { service, host, editor, secondEditor, addTemplate, fileContents } = createService();
        const file = addTemplate(ROOT_TEMPLATES, "a.json", { name: "Apple" });
        await service.setElementTemplates(editor.id);
        await service.setElementTemplates(secondEditor.id);
        secondEditor.hidden = true;
        fileContents.set(file, JSON.stringify({ name: "Avocado" }));

        service.refreshElementTemplates(editor.id);
        service.refreshElementTemplates(secondEditor.id);
        await vi.advanceTimersByTimeAsync(150);

        expect(host.notifier.errors).toEqual([]);
        expect(host.notifier.logged("error")).toEqual([]);
        expect(postedTemplates(editor)).toEqual([[{ name: "Apple" }], [{ name: "Avocado" }]]);

        // A webview shown again asks for its templates.
        secondEditor.hidden = false;
        await service.setElementTemplates(secondEditor.id);
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

function postedHidden(editor: FakeEditorHandle): unknown[] {
    return editor.posted.flatMap((message) =>
        message.type === "ElementTemplatesQuery" || message.type === "HiddenElementTemplatesQuery"
            ? [
                  {
                      type: message.type,
                      hidden: (message as ElementTemplatesQuery | HiddenElementTemplatesQuery)
                          .hiddenTemplates,
                  },
              ]
            : [],
    );
}

describe("BpmnElementTemplatesService with the user's template switches", () => {
    const SHOP_FOLDER = { source: "configFolder:work/.camunda" };
    const MAIL_OFF = { ...SHOP_FOLDER, templateId: "mail" };
    const ACME: TemplateSourceRef = { key: "marketplace:local:/opt/acme", scope: "allProjects" };

    it("sends the refs the switches hide with the templates", async () => {
        const { service, host, editor, addTemplate } = createService({ switches: true });
        addTemplate(ROOT_TEMPLATES, "mail.json", [
            { id: "mail", name: "Mail", version: 2 },
            { id: "mail", name: "Mail", version: 1 },
            { id: "sms", name: "SMS" },
        ]);
        await host.templatePreferences.change(templatePreferenceChange("project", [MAIL_OFF], []));

        await service.setElementTemplates(editor.id);

        expect(postedHidden(editor)).toEqual([
            {
                type: "ElementTemplatesQuery",
                hidden: [
                    { id: "mail", version: 1 },
                    { id: "mail", version: 2 },
                ],
            },
        ]);
    });

    it("sends only the hidden refs on a switch change, reading nothing from disk", async () => {
        const { service, host, editor, addTemplate, artifactSvc } = createService({
            switches: true,
        });
        addTemplate(ROOT_TEMPLATES, "mail.json", { id: "mail", name: "Mail" });
        await service.setElementTemplates(editor.id);
        vi.clearAllMocks();
        const logged = host.notifier.logged("info");

        await host.templatePreferences.change(
            templatePreferenceChange("project", [SHOP_FOLDER], []),
        );
        await service.refreshOffers();

        expect(postedHidden(editor)).toEqual([
            { type: "ElementTemplatesQuery", hidden: [] },
            { type: "HiddenElementTemplatesQuery", hidden: [{ id: "mail" }] },
        ]);
        expect(artifactSvc.readFile).not.toHaveBeenCalled();
        expect(artifactSvc.readDirectory).not.toHaveBeenCalled();
        expect(host.notifier.logged("info")).toEqual(logged);
    });

    it("sends nothing to an editor whose hidden refs the change leaves as they were", async () => {
        const { service, host, editor, secondEditor, nestedEditor, addTemplate } = createService({
            switches: true,
        });
        addTemplate(ROOT_TEMPLATES, "mail.json", { id: "mail", name: "Mail" });
        addTemplate(NESTED_TEMPLATES, "sms.json", { id: "sms", name: "SMS" });
        await service.setElementTemplates(editor.id);
        await service.setElementTemplates(nestedEditor.id);

        await host.templatePreferences.change(
            templatePreferenceChange("project", [{ source: "configFolder:work/sub/.camunda" }], []),
        );
        await service.refreshOffers();
        await service.refreshOffers();

        expect(postedHidden(editor)).toHaveLength(1);
        expect(postedHidden(nestedEditor)).toEqual([
            { type: "ElementTemplatesQuery", hidden: [] },
            { type: "HiddenElementTemplatesQuery", hidden: [{ id: "sms" }] },
        ]);
        expect(secondEditor.posted).toEqual([]);
    });

    it("sends nothing to a released editor", async () => {
        const { service, host, editor, addTemplate } = createService({ switches: true });
        addTemplate(ROOT_TEMPLATES, "mail.json", { id: "mail", name: "Mail" });
        await service.setElementTemplates(editor.id);
        service.releaseEditor(editor.id);

        await host.templatePreferences.change(
            templatePreferenceChange("project", [SHOP_FOLDER], []),
        );
        await service.refreshOffers();

        expect(postedHidden(editor)).toHaveLength(1);
    });

    it("passes a hidden editor by on a switch change; shown again, it gets the current refs", async () => {
        const { service, host, editor, addTemplate } = createService({ switches: true });
        addTemplate(ROOT_TEMPLATES, "mail.json", { id: "mail", name: "Mail" });
        await service.setElementTemplates(editor.id);
        editor.hidden = true;

        await host.templatePreferences.change(templatePreferenceChange("project", [MAIL_OFF], []));
        await service.refreshOffers();
        editor.hidden = false;
        await service.setElementTemplates(editor.id);

        expect(postedHidden(editor)).toEqual([
            { type: "ElementTemplatesQuery", hidden: [] },
            { type: "ElementTemplatesQuery", hidden: [{ id: "mail" }] },
        ]);
        expect(host.notifier.errors).toEqual([]);
    });

    it.each([
        [
            "the webview refuses it",
            (editor: FakeEditorHandle) =>
                vi.spyOn(editor, "postMessage").mockResolvedValueOnce(false),
        ],
        [
            "posting it throws",
            (editor: FakeEditorHandle) =>
                vi.spyOn(editor, "postMessage").mockRejectedValueOnce(new Error("gone")),
        ],
    ])("sends the hidden refs again on the next refresh when %s", async (_, failNextPost) => {
        const { service, host, editor, addTemplate } = createService({ switches: true });
        addTemplate(ROOT_TEMPLATES, "mail.json", { id: "mail", name: "Mail" });
        await service.setElementTemplates(editor.id);
        await host.templatePreferences.change(templatePreferenceChange("project", [MAIL_OFF], []));
        failNextPost(editor);

        await service.refreshOffers();
        await service.refreshOffers();

        expect(postedHidden(editor)).toEqual([
            { type: "ElementTemplatesQuery", hidden: [] },
            { type: "HiddenElementTemplatesQuery", hidden: [{ id: "mail" }] },
        ]);
    });

    it("ends with the current refs when a switch changes while templates load", async () => {
        const { service, host, editor, addTemplate, artifactSvc } = createService({
            switches: true,
        });
        addTemplate(ROOT_TEMPLATES, "mail.json", { id: "mail", name: "Mail" });
        let releaseLookup!: () => void;
        artifactSvc.getTemplateDirs.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseLookup = () => resolve([ROOT_TEMPLATES]);
                }),
        );

        const loading = service.setElementTemplates(editor.id);
        await host.templatePreferences.change(templatePreferenceChange("project", [MAIL_OFF], []));
        await service.refreshOffers();
        releaseLookup();
        await loading;

        expect(postedHidden(editor)).toEqual([
            { type: "ElementTemplatesQuery", hidden: [{ id: "mail" }] },
        ]);
    });

    it("hides the templates of a marketplace switched off where its switches live", async () => {
        const { service, host, editor, addTemplate, marketplaceSvc, fileContents } = createService({
            switches: true,
        });
        addTemplate(ROOT_TEMPLATES, "mail.json", { id: "mail", name: "Mail" });
        marketplaceSvc.getCachedTemplateSources.mockResolvedValue([
            { source: ACME, paths: ["/cache/acme/rest.json"] },
            { paths: ["/cache/loose/sms.json"] },
        ]);
        fileContents.set("/cache/acme/rest.json", JSON.stringify({ id: "rest", name: "REST" }));
        fileContents.set("/cache/loose/sms.json", JSON.stringify({ id: "sms", name: "SMS" }));
        await host.templatePreferences.change(
            templatePreferenceChange("project", [{ source: ACME.key }], []),
        );
        await host.templatePreferences.change(
            templatePreferenceChange("allProjects", [{ source: ACME.key }, SHOP_FOLDER], []),
        );

        await service.setElementTemplates(editor.id);

        expect(postedHidden(editor)).toEqual([
            { type: "ElementTemplatesQuery", hidden: [{ id: "rest" }] },
        ]);
        expect(postedNames(editor)).toEqual(["Mail", "REST", "SMS"]);
    });

    it("hides nothing on a host that keeps no switches", async () => {
        const { service, host, editor, addTemplate } = createService();
        addTemplate(ROOT_TEMPLATES, "mail.json", { id: "mail", name: "Mail" });
        await host.templatePreferences.change(
            templatePreferenceChange("project", [SHOP_FOLDER], []),
        );

        await service.setElementTemplates(editor.id);
        await service.refreshOffers();

        expect(postedHidden(editor)).toEqual([{ type: "ElementTemplatesQuery", hidden: [] }]);
    });
});
