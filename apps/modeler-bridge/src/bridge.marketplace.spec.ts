/**
 * End-to-end coverage for the template-marketplace RPC paths on the bridge.
 *
 * Same harness as `bridge.codeLink.spec.ts`: the real bridge (`createBridge`)
 * runs against a fake transport (a frames array) over a real temp filesystem, so
 * the `TemplateMarketplaceService` + `MarketplaceCache` + `LocalFileSource` it
 * constructs do genuine fs reads/writes. A local-folder marketplace is the one
 * source needing no network, so the happy path is fully deterministic here; the
 * token round-trip stays covered by the core's `TemplateMarketplaceService.spec.ts`.
 *
 * Covered: `marketplace/add` reading the host's scopes (`marketplaceState/read`),
 * asking the core's add question (`marketplacePrompt/show`), asking again when
 * the core refuses the location, reading the registrations again once the
 * marketplace is fetched, and registering through the acknowledged
 * `marketplaceState/save` unless a list the scope reaches holds it already; `marketplace/remove` offering the registered entries
 * through `picker/show` and unregistering them through the acknowledged
 * `marketplaceState/remove`; and `marketplace/update` folding a piggybacked
 * marketplace list into a summary.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    hostErrorReply,
    hostNotification,
    hostReply,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";
import { Rpc } from "./transport/adapter/out/Rpc";

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

const TEMPLATE_NAME = "Marketplace Template";
const TEMPLATE_JSON = JSON.stringify({
    name: TEMPLATE_NAME,
    id: "io.miragon.marketplace.tmpl",
    appliesTo: ["bpmn:Task"],
    properties: [],
});

/** The scopes IntelliJ reports: it keeps no place for a self-hosted marketplace. */
function intellijRegistrations({
    project = [],
    allProjects = [],
}: { project?: string[]; allProjects?: string[] } = {}) {
    return {
        registered: { project, allProjects },
        writable: [
            { scope: "project", savedIn: { kind: "file", path: [".idea", "workspace.xml"] } },
            {
                scope: "allProjects",
                savedIn: {
                    kind: "settingsPage",
                    path: ["Settings", "Tools", "Miragon BPMN Modeler", "Template Marketplaces"],
                },
            },
        ],
    };
}

/** A core→host request as the harness records it. */
interface RequestFrame {
    readonly id: number;
    readonly method: string;
    readonly params: Record<string, unknown>;
}

const isRequest = (method: string) => (f: { method?: string; id?: number }) =>
    f.method === method && f.id != null;
const isSaveRequest = isRequest("marketplaceState/save");
const isShowInfo = (message: string) => (f: any) =>
    f.method === "notifier/showInfo" && f.params.message === message;

const isTemplatesQuery = (name: string) => (f: any) =>
    f.method === "editor/postMessage" &&
    f.params.message?.type === "ElementTemplatesQuery" &&
    (f.params.message.elementTemplates ?? []).some((t: any) => t?.name === name);

describe("bridge template marketplace (real core + cache over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    /**
     * Sets up a registered BPMN editor plus a distinct cache root. The marketplace
     * folder is created per-test so the missing-manifest case can omit it.
     */
    async function setup(): Promise<{
        rpc: Rpc;
        frames: any[];
        editorId: string;
        cacheRoot: string;
        tmp: string;
    }> {
        const tmp = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-mkt-"));
        const workspaceRoot = join(tmp, "workspace");
        const cacheRoot = join(tmp, "cache");
        await fs.mkdir(workspaceRoot, { recursive: true });
        const sourcePath = join(workspaceRoot, "process.bpmn");
        await fs.writeFile(sourcePath, BPMN_XML, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge(
            (line) => frames.push(JSON.parse(line)),
            () => {},
            {
                marketplaceCacheRoot: cacheRoot,
                homeDir: tmp,
            },
        );
        const editorId = `file://${sourcePath}`;
        await rpc.handleLine(
            hostNotification(
                "session/register",
                registerParams(editorId, workspaceRoot, sourcePath, BPMN_XML),
            ),
        );
        // A marketplace change refreshes only editors whose modeler asked for templates.
        await rpc.handleLine(
            hostNotification("webview/message", {
                editorId,
                message: { type: "GetElementTemplatesCommand" },
            }),
        );
        await waitForFrame(
            frames,
            (f) =>
                f.method === "editor/postMessage" &&
                f.params.message?.type === "ElementTemplatesQuery",
        );

        cleanups.push(() => fs.rm(tmp, { recursive: true, force: true }));
        return { rpc, frames, editorId, cacheRoot, tmp };
    }

    /** Writes a valid local-folder marketplace with one element template. */
    async function writeLocalMarketplace(tmp: string): Promise<string> {
        const folder = join(tmp, "marketplace");
        await fs.mkdir(join(folder, "element-templates"), { recursive: true });
        await fs.writeFile(
            join(folder, "marketplace.json"),
            JSON.stringify({ sources: [{ path: "element-templates" }] }),
            "utf8",
        );
        await fs.writeFile(
            join(folder, "element-templates", "template.json"),
            TEMPLATE_JSON,
            "utf8",
        );
        return folder;
    }

    /** Answers the core's request for `method` the next time it is sent, from `fromIndex` on. */
    async function answer(
        rpc: Rpc,
        frames: unknown[],
        method: string,
        result: unknown,
        fromIndex = 0,
    ): Promise<RequestFrame> {
        const request: RequestFrame = await waitForFrame(frames, isRequest(method), { fromIndex });
        await rpc.handleLine(hostReply(request.id, result));
        return request;
    }

    /** Starts an add and answers the host's scopes and the add question with `location` and `scope`. */
    async function addMarketplace(
        rpc: Rpc,
        frames: unknown[],
        location: string,
        scope = "project",
    ): Promise<RequestFrame> {
        await rpc.handleLine(hostNotification("marketplace/add", { settings: {} }));
        await answer(rpc, frames, "marketplaceState/read", intellijRegistrations());
        return answer(rpc, frames, "marketplacePrompt/show", { location, scope });
    }

    /** Answers the registrations read the add makes once it fetched the marketplace. */
    function answerReadAfterFetch(
        rpc: Rpc,
        frames: unknown[],
        question: RequestFrame,
        registrations = intellijRegistrations(),
    ): Promise<RequestFrame> {
        return answer(
            rpc,
            frames,
            "marketplaceState/read",
            registrations,
            frames.indexOf(question) + 1,
        );
    }

    it("adds a local marketplace: asks the core's question, registers the answer's scope, then refreshes the editor", async () => {
        const { rpc, frames, tmp, cacheRoot } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        const question = await addMarketplace(rpc, frames, folder, "allProjects");

        expect(question.params).toEqual({
            title: "Add Template Marketplace",
            prompt: "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
            placeholder: "https://github.com/owner/repo  or  ~/path/to/folder",
            location: "",
            scopes: [
                {
                    scope: "project",
                    label: "Register for this project",
                    description: "Saved in .idea/workspace.xml",
                },
                {
                    scope: "allProjects",
                    label: "Register for all my projects",
                    description:
                        "Saved in Settings ▸ Tools ▸ Miragon BPMN Modeler ▸ Template Marketplaces",
                },
            ],
            scope: "project",
        });
        await answerReadAfterFetch(rpc, frames, question);
        // The registration is an acknowledged request carrying the answer's scope.
        const save = await answer(rpc, frames, "marketplaceState/save", null);
        expect(save.params).toEqual({ location: folder, scope: "allProjects" });

        await waitForFrame(frames, isTemplatesQuery(TEMPLATE_NAME));
        await waitForFrame(frames, isShowInfo("Marketplace added."));
        expect((await fs.readdir(cacheRoot)).length).toBe(1);
    });

    it("says where the entry is registered and saves nothing for this project when all my projects already hold the fetched entry", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        const question = await addMarketplace(rpc, frames, folder, "project");
        await answerReadAfterFetch(
            rpc,
            frames,
            question,
            intellijRegistrations({ allProjects: [folder] }),
        );

        const toast = await waitForFrame(frames, (f) => f.method === "notifier/showInfo");
        expect(toast.params).toEqual({
            message: "Marketplace already registered for all my projects.",
        });
        expect(frames.find(isSaveRequest)).toBeUndefined();
    });

    it("asks again with the refused entry and why, without naming a place IntelliJ lacks", async () => {
        const { rpc, frames } = await setup();

        const first = await addMarketplace(rpc, frames, "https://git.acme.com/group/project");
        const again = await answer(
            rpc,
            frames,
            "marketplacePrompt/show",
            null,
            frames.indexOf(first) + 1,
        );

        expect(again.params).toMatchObject({
            location: "https://git.acme.com/group/project",
            invalidLocation:
                "Enter a GitHub or GitLab repository URL, or a local folder path, holding a marketplace.json.",
            scope: "project",
        });
        await settle();
        expect(frames.find(isSaveRequest)).toBeUndefined();
        expect(frames.find((f) => f.method?.startsWith("notifier/show"))).toBeUndefined();
    });

    it("persists an added marketplace whose sources serve nothing, and warns why", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = join(tmp, "future-marketplace");
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(
            join(folder, "marketplace.json"),
            JSON.stringify({ sources: [{ type: "palette-entries", path: "palette" }] }),
            "utf8",
        );

        const question = await addMarketplace(rpc, frames, folder);
        await answerReadAfterFetch(rpc, frames, question);
        await answer(rpc, frames, "marketplaceState/save", null);

        const toast = await waitForFrame(
            frames,
            (f) => f.method === "notifier/showInfo" || f.method === "notifier/showWarning",
        );
        expect(toast).toEqual({
            method: "notifier/showWarning",
            params: {
                message:
                    "Marketplace added, but none of its sources could be fetched:\n" +
                    'sources[0]: content type "palette-entries" is not supported by this version',
            },
        });
    });

    it("does not persist when the marketplace.json is missing", async () => {
        const { rpc, frames, tmp } = await setup();
        // A folder with no marketplace.json — the fetch throws before any persist.
        const folder = join(tmp, "empty");
        await fs.mkdir(folder, { recursive: true });

        await addMarketplace(rpc, frames, folder);

        await waitForFrame(frames, (f) => f.method === "notifier/showError");
        await settle();
        expect(frames.find((f) => f.method === "marketplaceState/save")).toBeUndefined();
        expect(frames.find((f) => f.method === "notifier/showInfo")).toBeUndefined();
    });

    it("updates from the piggybacked marketplace list and reports a summary", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        await rpc.handleLine(
            hostNotification("marketplace/update", { settings: { marketplaces: [folder] } }),
        );

        await waitForFrame(frames, isShowInfo("Updated 1 marketplace(s)."));
        // Update never persists — the list already lives in settings.
        expect(frames.find((f) => f.method === "marketplaceState/save")).toBeUndefined();
        // The cached template reached the open editor.
        await waitForFrame(frames, isTemplatesQuery(TEMPLATE_NAME));
    });

    it("removes a marketplace: offers the host's entries, unregisters the chosen one and prunes its cache slot", async () => {
        const { rpc, frames, tmp, cacheRoot } = await setup();
        const folder = await writeLocalMarketplace(tmp);
        await rpc.handleLine(
            hostNotification("marketplace/update", { settings: { marketplaces: [folder] } }),
        );
        await waitForFrame(frames, isTemplatesQuery(TEMPLATE_NAME));
        expect((await fs.readdir(cacheRoot)).length).toBe(1);

        await rpc.handleLine(
            hostNotification("marketplace/remove", { settings: { marketplaces: [folder] } }),
        );
        await answer(
            rpc,
            frames,
            "marketplaceState/read",
            intellijRegistrations({ project: [folder] }),
        );
        const choice = await answer(rpc, frames, "picker/show", { selected: [0] });
        const removal = await waitForFrame(frames, isRequest("marketplaceState/remove"));
        // IntelliJ pushes the post-removal snapshot before it acks.
        await rpc.handleLine(
            hostNotification("settings/didChange", { settings: { marketplaces: [] } }),
        );
        await rpc.handleLine(hostReply(removal.id, null));

        await waitForFrame(frames, isShowInfo("Removed 1 marketplace(s)."));
        expect(choice.params).toEqual({
            title: "Remove Template Marketplace",
            placeholder: "Select marketplaces to remove",
            canPickMany: true,
            items: [{ label: folder, description: "This project" }],
        });
        expect(removal.params).toEqual({ entries: [folder] });
        expect(await fs.readdir(cacheRoot)).toEqual([]);
    });

    it("says that nothing is registered and offers no choice", async () => {
        const { rpc, frames } = await setup();

        await rpc.handleLine(hostNotification("marketplace/remove", { settings: {} }));
        await answer(rpc, frames, "marketplaceState/read", intellijRegistrations());

        await waitForFrame(frames, isShowInfo("No marketplaces registered."));
        expect(frames.find((f) => f.method === "picker/show")).toBeUndefined();
    });

    it("expands a leading ~ against the home dir before fetching and persisting", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        const question = await addMarketplace(rpc, frames, "  ~/marketplace  ");
        await answerReadAfterFetch(rpc, frames, question);

        const save = await waitForFrame(frames, isSaveRequest);
        expect(save.params.location).toBe(folder);
    });

    it("reports the add as failed and drops the fetched cache when persisting it fails", async () => {
        const { rpc, frames, tmp, cacheRoot } = await setup();
        const folder = await writeLocalMarketplace(tmp);

        const question = await addMarketplace(rpc, frames, folder);
        await answerReadAfterFetch(rpc, frames, question);
        const save = await waitForFrame(frames, isSaveRequest);
        await rpc.handleLine(hostErrorReply(save.id, "disk full"));

        const failure = await waitForFrame(frames, (f) => f.method === "notifier/showError");
        expect(failure.params).toEqual({ message: "Failed to add marketplace.\ndisk full" });
        await settle();
        expect(frames.some(isShowInfo("Marketplace added."))).toBe(false);
        expect(frames.some(isTemplatesQuery(TEMPLATE_NAME))).toBe(false);
        expect(await fs.readdir(cacheRoot)).toEqual([]);
    });

    it("says so when no marketplace is configured to update", async () => {
        const { rpc, frames } = await setup();

        await rpc.handleLine(
            hostNotification("marketplace/update", { settings: { marketplaces: [] } }),
        );

        await waitForFrame(frames, isShowInfo("No marketplaces configured to update."));
    });

    it("names every marketplace that failed to update", async () => {
        const { rpc, frames, tmp } = await setup();
        const folder = await writeLocalMarketplace(tmp);
        const missingFolder = join(tmp, "missing");

        await rpc.handleLine(
            hostNotification("marketplace/update", {
                settings: { marketplaces: [folder, missingFolder] },
            }),
        );

        const error = await waitForFrame(frames, (f) => f.method === "notifier/showError");
        const [summary, ...failedLines] = error.params.message.split("\n");
        expect(summary).toBe("Updated 1 of 2 marketplaces. Failed:");
        expect(failedLines).toHaveLength(1);
        expect(failedLines[0]).toContain(missingFolder);
    });
});
