import { describe, expect, it } from "vitest";

import { BpmnFileQuery, LogInfoCommand } from "@miragon/bpmn-modeler-shared";

import {
    DirectoryNotFound,
    FileNotFound,
    isHiddenEditorError,
    NoWorkspaceFolderFoundError,
    UserCancelledError,
} from "../shared/domain/errors";
import { createTestHost } from "./createTestHost";
import { InMemoryWorkspace } from "./InMemoryWorkspace";
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

describe("ScriptedPicker", () => {
    it("dismisses unanswered prompts with each prompt's own cancel convention", async () => {
        const picker = new ScriptedPicker();

        await expect(picker.pickNewModelEngine("Engine")).rejects.toThrow(UserCancelledError);
        await expect(picker.pickEngineVersion("c7", ["7.22"])).rejects.toThrow(UserCancelledError);
        await expect(picker.pickMigrationScope(1, 1)).rejects.toThrow(UserCancelledError);
        await expect(
            picker.pickWorkspaceFiles({ glob: "**/*.bpmn", placeholder: "Pick" }),
        ).resolves.toEqual([]);
        await expect(picker.pickPayloadFile(["/a.json"])).resolves.toBeNull();
        await expect(picker.pickScriptLanguage("groovy")).resolves.toBeUndefined();
        await expect(
            picker.confirmDestructive({ title: "Delete", confirmLabel: "Delete", details: [] }),
        ).resolves.toBe(false);
        await expect(picker.pickDeploymentTarget(["dev"])).resolves.toBeUndefined();
        await expect(
            picker.pickDeploymentStatusAction({ canVerify: true }),
        ).resolves.toBeUndefined();
        expect(picker.prompts.map((prompt) => prompt.method)).toHaveLength(9);
    });

    it("returns scripted answers and offers the referenced-model choice only on a multi-match", async () => {
        const picker = new ScriptedPicker({ engineVersion: "8.7.0", referencedModel: "/b.bpmn" });

        await expect(picker.pickEngineVersion("c8", ["8.7.0"])).resolves.toBe("8.7.0");
        const single = await picker.searchAndPickReferencedModel("Pick", async () => ({
            kind: "matches",
            paths: ["/a.bpmn"],
        }));
        const multi = await picker.searchAndPickReferencedModel("Pick", async () => ({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
        }));

        expect(single.chosen).toBeUndefined();
        expect(multi.chosen).toBe("/b.bpmn");
    });
});

describe("createTestHost", () => {
    it("routes document reads and writes to the addressed editor and drops stale revisions", async () => {
        const host = createTestHost();
        const order = host.openEditor("/work/order.bpmn", "<order/>");
        host.openEditor("/work/invoice.bpmn", "<invoice/>");
        const revision = host.store.markHostDocumentUpdated(order.id);

        await expect(host.documents.write(order.id, "<edited/>", revision)).resolves.toBe(true);
        await expect(host.documents.write(order.id, "<stale/>", revision - 1)).resolves.toBe(false);
        await host.documents.save(order.id);

        expect(host.documents.getContent(order.id)).toBe("<edited/>");
        expect(host.documents.getFilePath(order.id)).toBe("/work/order.bpmn");
        expect(order.saveCount).toBe(1);
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

    it("records notifications the way the hosts surface them", async () => {
        const host = createTestHost();

        host.notifier.notifyError("Deployment failed", new Error("timeout"));
        await host.notifier.withProgress("Deploying", async () => undefined);

        expect(host.notifier.errors).toEqual(["Deployment failed\ntimeout"]);
        expect(host.notifier.logged("error")).toEqual(["timeout"]);
        expect(host.notifier.progressTitles).toEqual(["Deploying"]);
    });

    it("keeps logged errors whole, so the transcript includes their stack and cause", () => {
        const host = createTestHost();
        const failure = Object.assign(new Error("request failed"), {
            cause: new Error("socket hang up"),
        });

        host.notifier.logError(failure);
        host.notifier.logError("plain message");

        expect(host.notifier.loggedErrors).toEqual([failure]);
        expect(host.notifier.transcript()).toContain(failure.stack);
        expect(host.notifier.transcript()).toContain("socket hang up");
        expect(host.notifier.transcript()).toContain("plain message");
    });
});
