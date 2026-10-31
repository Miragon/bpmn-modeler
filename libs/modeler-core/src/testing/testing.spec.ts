import { describe, expect, it } from "vitest";

import { BpmnFileQuery, LogInfoCommand } from "@miragon/bpmn-modeler-shared";

import {
    DirectoryNotFound,
    FileNotFound,
    isHiddenEditorError,
    NoWorkspaceFolderFoundError,
} from "../kernel/domain/errors";
import { ChoicePrompt, SearchPrompt } from "../kernel/domain/prompts";
import { createTestHost } from "./createTestHost";
import { InMemorySettings } from "./InMemorySettings";
import { InMemoryWorkspace } from "./InMemoryWorkspace";
import { RecordingStatusBar } from "./RecordingStatusBar";
import { ScriptedPicker } from "./ScriptedPicker";

describe("InMemoryWorkspace", () => {
    const workspace = () =>
        new InMemoryWorkspace(["/work", "/work/nested"], {
            "/work/order.bpmn": "<order/>",
            "/work/dist/stale.bpmn": "<stale/>",
            "/work/forms/a.form": "{}",
            "/work/nested/inner.bpmn": "<inner/>",
            "/elsewhere/loose.bpmn": "<loose/>",
        });

    it("resolves the innermost folder of a document and throws outside every folder", () => {
        const ws = workspace();

        expect(ws.getWorkspaceFolderForDocument("/work/nested/inner.bpmn")).toBe("/work/nested");
        expect(ws.getWorkspaceFolderForDocument("/work")).toBe("/work");
        expect(ws.findWorkspaceFolderForDocument("/elsewhere/loose.bpmn")).toBeUndefined();
        expect(() => ws.getWorkspaceFolderForDocument("/elsewhere/loose.bpmn")).toThrow(
            NoWorkspaceFolderFoundError,
        );
    });

    it("finds files in the folders by glob, honouring exclude and limit", async () => {
        const ws = new InMemoryWorkspace(["/work"], {
            "/work/order.bpmn": "",
            "/work/dist/stale.bpmn": "",
            "/work/forms/a.form": "",
            "/elsewhere/loose.bpmn": "",
        });

        await expect(ws.findFiles("**/*.bpmn")).resolves.toEqual([
            "/work/order.bpmn",
            "/work/dist/stale.bpmn",
        ]);
        await expect(ws.findFiles("**/*.bpmn", "**/dist/**")).resolves.toEqual([
            "/work/order.bpmn",
        ]);
        await expect(ws.findFiles("**/*.{bpmn,form}", null, 1)).resolves.toHaveLength(1);
    });

    it("answers with the folders as they are after one is added or removed", async () => {
        const ws = new InMemoryWorkspace(["/work"], {
            "/work/order.bpmn": "",
            "/shared/ship.bpmn": "",
        });

        ws.addFolder("/shared");
        ws.addFolder("/shared");
        expect(ws.getWorkspaceFolderPaths()).toEqual(["/work", "/shared"]);
        expect(ws.findWorkspaceFolderForDocument("/shared/ship.bpmn")).toBe("/shared");
        await expect(ws.findFiles("**/*.bpmn")).resolves.toEqual([
            "/work/order.bpmn",
            "/shared/ship.bpmn",
        ]);

        ws.removeFolder("/work");
        ws.removeFolder("/missing");
        expect(ws.getWorkspaceFolderPaths()).toEqual(["/shared"]);
        expect(ws.findWorkspaceFolderForDocument("/work/order.bpmn")).toBeUndefined();
        await expect(ws.findFiles("**/*.bpmn")).resolves.toEqual(["/shared/ship.bpmn"]);
    });

    it("lists direct children and reports missing files and directories with the core errors", async () => {
        const ws = workspace();

        await expect(ws.readDirectory("/work")).resolves.toEqual(
            expect.arrayContaining([
                ["order.bpmn", "file"],
                ["dist", "directory"],
            ]),
        );
        await expect(ws.readDirectory("/missing")).rejects.toThrow(DirectoryNotFound);
        await expect(ws.readFile("/missing.bpmn")).rejects.toThrow(FileNotFound);
    });

    it("keeps the directory of a seeded file after that file is deleted, as a disk does", async () => {
        const ws = new InMemoryWorkspace(["/w"], { "/w/forms/a.form": "{}" });

        await ws.deleteFile("/w/forms/a.form");

        await expect(ws.readDirectory("/w/forms")).resolves.toEqual([]);
    });

    it("reports only registered paths as symbolic links, dangling ones included", async () => {
        const ws = workspace();
        ws.symbolicLinks.add("/work/.env");

        await expect(ws.isSymbolicLink("/work/.env")).resolves.toBe(true);
        await expect(ws.isSymbolicLink("/work/order.bpmn")).resolves.toBe(false);
        await expect(ws.isSymbolicLink("/missing")).resolves.toBe(false);
    });

    it("notifies matching watchers of creates, changes and deletes until disposed", async () => {
        const ws = workspace();
        const events: string[] = [];
        const watcher = ws.createWatcher("/work", "**/*.bpmn", {
            onCreate: (path) => events.push(`create ${path}`),
            onChange: (path) => events.push(`change ${path}`),
            onDelete: (path) => events.push(`delete ${path}`),
        });

        await ws.writeFile("/work/new.bpmn", "<new/>");
        await ws.writeFile("/work/order.bpmn", "<order2/>");
        await ws.writeFile("/work/forms/b.form", "{}");
        await ws.deleteDirectory("/work/dist");
        watcher.dispose();
        ws.deleteFile("/work/order.bpmn");

        expect(events).toEqual([
            "create /work/new.bpmn",
            "change /work/order.bpmn",
            "delete /work/dist/stale.bpmn",
        ]);
        expect(ws.watchers).toEqual([
            expect.objectContaining({ root: "/work", glob: "**/*.bpmn", disposed: true }),
        ]);
    });
});

describe("InMemorySettings", () => {
    it("gives every instance lists of its own", () => {
        const defaults = structuredClone(new InMemorySettings().values);
        const edited = new InMemorySettings();

        edited.values.favouriteBpmnElements.push("bpmn:Task");
        edited.values.marketplaces.push("https://github.com/acme/templates");

        expect(new InMemorySettings().values).toEqual(defaults);
    });
});

describe("ScriptedPicker answers by prompt id", () => {
    const engines: ChoicePrompt<string> = {
        id: "engine",
        placeholder: "Select the engine",
        items: [
            { label: "Camunda 7", value: "c7" },
            { label: "Camunda 8", value: "c8" },
        ],
    };
    const files: ChoicePrompt<string> = {
        id: "files",
        placeholder: "Select files",
        items: ["/a.form", "/b.dmn", "/c.json"].map((path) => ({ label: path, path, value: path })),
    };
    const deleteTarget = {
        id: "deleteTarget",
        title: "Delete dev?",
        confirmLabel: "Delete",
        details: ["dev"],
    };
    const locate = (paths: string[]): SearchPrompt<string[]> => ({
        id: "locate",
        searchingPlaceholder: "Searching…",
        search: async () => paths,
        choices: (found) =>
            found.length > 1
                ? {
                      id: "locatedFile",
                      placeholder: "Select the file",
                      items: found.map((path) => ({ label: path, value: path })),
                  }
                : undefined,
    });

    it("returns the scripted value of each prompt it is asked", async () => {
        const { picker } = createTestHost({
            promptAnswers: {
                engine: "c8",
                files: ["/a.form", "/c.json"],
                deleteTarget: true,
                locatedFile: "/w/b.bpmn",
            },
        });

        await expect(picker.choose(engines)).resolves.toBe("c8");
        await expect(picker.chooseMany(files)).resolves.toEqual(["/a.form", "/c.json"]);
        await expect(picker.confirm(deleteTarget)).resolves.toBe(true);
        await expect(picker.searchAndChoose(locate(["/w/a.bpmn", "/w/b.bpmn"]))).resolves.toEqual({
            outcome: ["/w/a.bpmn", "/w/b.bpmn"],
            chosen: "/w/b.bpmn",
        });
        expect(picker.prompts.map((prompt) => prompt.method)).toEqual([
            "choose",
            "chooseMany",
            "confirm",
            "searchAndChoose",
        ]);
    });

    it("dismisses an unanswered prompt", async () => {
        const picker = new ScriptedPicker();

        await expect(picker.choose(engines)).resolves.toBeUndefined();
        await expect(picker.chooseMany(files)).resolves.toEqual([]);
        await expect(picker.confirm(deleteTarget)).resolves.toBe(false);
        await expect(picker.searchAndChoose(locate(["/a", "/b"]))).resolves.toEqual({
            outcome: ["/a", "/b"],
            chosen: undefined,
        });
    });

    it("chooses nothing when the search outcome leaves no choice", async () => {
        const picker = new ScriptedPicker({ locatedFile: "/w/a.bpmn" });

        await expect(picker.searchAndChoose(locate(["/w/a.bpmn"]))).resolves.toEqual({
            outcome: ["/w/a.bpmn"],
            chosen: undefined,
        });
    });

    it.each([
        [
            "a value the prompt does not offer",
            { engine: "c9" },
            (picker: ScriptedPicker) => picker.choose(engines),
        ],
        [
            "a list with a file not offered",
            { files: ["/a.form", "/d.bpmn"] },
            (picker: ScriptedPicker) => picker.chooseMany(files),
        ],
        [
            "a single value for a multi-choice",
            { files: "/a.form" },
            (picker: ScriptedPicker) => picker.chooseMany(files),
        ],
        [
            "a non-boolean confirmation",
            { deleteTarget: "yes" },
            (picker: ScriptedPicker) => picker.confirm(deleteTarget),
        ],
        [
            "a located file not among the matches",
            { locatedFile: "/w/c.bpmn" },
            (picker: ScriptedPicker) => picker.searchAndChoose(locate(["/w/a.bpmn", "/w/b.bpmn"])),
        ],
    ])("rejects %s", async (_case, promptAnswers, ask) => {
        await expect(ask(new ScriptedPicker(promptAnswers))).rejects.toThrow(
            /not an answer to prompt "\w+"/,
        );
    });
});

describe("RecordingStatusBar", () => {
    it("holds the last view of each slot until the slot is hidden", () => {
        const statusBar = new RecordingStatusBar();
        const loading = {
            text: "Loading element templates…",
            icon: "loading",
            tone: "neutral",
        } as const;
        const engine = {
            text: "Camunda 8 (8.7)",
            tone: "neutral",
            action: "changeEngineVersion",
        } as const;
        const lint = { text: "BPMNlint: off", icon: "off", tone: "neutral" } as const;

        statusBar.show("elementTemplates", loading);
        statusBar.show("engineVersion", { text: "Camunda 7 (7.22)", tone: "neutral" });
        statusBar.show("engineVersion", engine);
        statusBar.show("bpmnlint", lint);
        statusBar.show("deploymentTarget", { text: "dev", icon: "dot", tone: "success" });
        statusBar.hide("deploymentTarget");
        statusBar.hide("elementTemplates");
        statusBar.show("elementTemplates", { ...loading, transient: true });

        expect(statusBar.views).toEqual({
            elementTemplates: { ...loading, transient: true },
            engineVersion: engine,
            bpmnlint: lint,
        });
    });
});

describe("createTestHost", () => {
    it("routes document reads and writes to the addressed editor and drops stale revisions", async () => {
        const host = createTestHost();
        const order = host.openEditor("/work/order.bpmn", "<order/>");
        host.openEditor("/work/invoice.bpmn", "<invoice/>", { focused: true });
        const revision = host.store.markHostDocumentUpdated(order.id);

        await expect(host.documents.write(order.id, "<edited/>", revision)).resolves.toBe(true);
        await expect(host.documents.write(order.id, "<stale/>", revision - 1)).resolves.toBe(false);
        await host.documents.save(order.id);

        expect(host.documents.getContent(order.id)).toBe("<edited/>");
        expect(host.documents.getFilePath(order.id)).toBe("/work/order.bpmn");
        expect(order.saveCount).toBe(1);
    });

    it("blurs the focused editor when another one opens focused, as the hosts do", async () => {
        const host = createTestHost();
        const focusChanges: string[] = [];
        const recordFocusChanges = (editorId: string) =>
            host.store.subscribeToFocusChangeEvent(editorId, (focused) =>
                focusChanges.push(`${editorId} ${focused}`),
            );
        const order = host.openEditor("/work/order.bpmn", "", { focused: true });
        recordFocusChanges(order.id);
        const invoice = host.openEditor("/work/invoice.bpmn", "", { focused: true });
        recordFocusChanges(invoice.id);
        host.openEditor("/work/background.bpmn");

        expect(host.store.getFocusedEditorId()).toBe(invoice.id);

        const shipment = await host.openSession("/work/shipment.bpmn", []);

        expect([order, invoice, shipment].map((editor) => editor.isActive())).toEqual([
            false,
            false,
            true,
        ]);
        expect(focusChanges).toEqual([`${order.id} false`, `${invoice.id} false`]);
    });

    it("plays host events into the store and rejects posts to a hidden webview", async () => {
        const host = createTestHost();
        const editor = host.openEditor("/work/order.bpmn");
        const received: string[] = [];
        host.store.subscribeToMessageEvent(editor.id, async (message) => {
            received.push(message.type);
        });

        editor.receive(new LogInfoCommand("hello"));
        await host.store.postMessage(editor.id, new BpmnFileQuery("<x/>", undefined));
        editor.hidden = true;

        expect(received).toEqual(["LogInfoCommand"]);
        expect(editor.postedOfType<BpmnFileQuery>("BpmnFileQuery")).toHaveLength(1);
        await expect(
            host.store.postMessage(editor.id, new BpmnFileQuery("<y/>", undefined)),
        ).rejects.toSatisfy(isHiddenEditorError);
    });

    it("keeps credentials per slot and treats a blank token answer as a decline", async () => {
        const host = createTestHost({ tokenAnswers: { "github.com": "  ", "gitlab.com": " t " } });

        await host.secrets.saveBasicAuth("ada", "secret", "targets.json::dev");
        await host.secrets.saveOAuth2("client", "s3cret");
        await host.secrets.delete("targets.json::dev");

        await expect(host.secrets.getBasicAuth("targets.json::dev")).resolves.toBeUndefined();
        await expect(host.secrets.getOAuth2()).resolves.toEqual({
            clientId: "client",
            clientSecret: "s3cret",
        });
        await expect(host.tokenPrompt.promptForToken("github.com", "401")).resolves.toBeUndefined();
        await expect(host.tokenPrompt.promptForToken("gitlab.com", "401")).resolves.toBe("t");
    });

    it("keeps approved destinations per slot and drops them with the slot's credentials", async () => {
        const host = createTestHost();
        const origins = ["https://engine.example"];

        await host.secrets.saveApprovedDestinations("targets.json::dev", origins);
        await host.secrets.saveApprovedDestinations("targets.json::prod", ["https://prod.example"]);
        origins.push("https://later.example");
        await host.secrets.delete("targets.json::prod");

        await expect(host.secrets.getApprovedDestinations("targets.json::dev")).resolves.toEqual([
            "https://engine.example",
        ]);
        await expect(host.secrets.getApprovedDestinations("targets.json::prod")).resolves.toEqual(
            [],
        );
        await expect(host.secrets.getApprovedDestinations("targets.json::new")).resolves.toEqual(
            [],
        );
    });

    it("shows a notified error as the hosts do and logs it with its context and stack", async () => {
        const host = createTestHost();
        const failure = new Error("timeout");

        host.notifier.notifyError("Deployment failed", failure);
        await host.notifier.withProgress("Deploying", async () => undefined);

        expect(host.notifier.errors).toEqual(["Deployment failed\ntimeout"]);
        expect(host.notifier.logged("error")).toEqual([`Deployment failed: ${failure.stack}`]);
        expect(host.notifier.loggedErrors).toEqual([failure]);
        expect(host.notifier.progressTitles).toEqual(["Deploying"]);
    });

    it("logs an error as its stack and a string verbatim", () => {
        const host = createTestHost();
        const failure = new Error("request failed");
        const stackless = new TypeError("bad");
        delete stackless.stack;

        host.notifier.logError(failure);
        host.notifier.logError(stackless);
        host.notifier.logError("[webview] boom\nat foo (x.js:1)");

        expect(host.notifier.logged("error")).toEqual([
            failure.stack,
            "TypeError: bad",
            "[webview] boom\nat foo (x.js:1)",
        ]);
        expect(host.notifier.loggedErrors).toEqual([failure, stackless]);
        expect(host.notifier.transcript()).toContain(failure.stack);
    });
});
