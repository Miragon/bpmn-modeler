/**
 * End-to-end coverage for the user's template switches on the bridge: the
 * real bridge (`createBridge`) over a temp workspace whose config folder holds
 * two element templates, with IntelliJ's side played through the recorded
 * frames.
 *
 * Covered: the switches `session/register` seeds hide a template in the first
 * `ElementTemplatesQuery`; a `templatePreferences/didChange` reaches an open
 * editor as `HiddenElementTemplatesQuery`, and an older one is ignored; the
 * add-on catalog offers a template's switch and its source's, performs them
 * through `templatePreferences/change` in the source's scope and follows the
 * push the host sends before it answers, as the open editor does; a
 * marketplace's templates carry the switch of the scope the host registered it in.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    AddOnCatalogModel,
    AddOnsFeature,
    AddOnSourceView,
    AddOnView,
    ProjectScope,
    TemplatePreferences,
    templatePreferencesAfter,
    templatePreferencesKey,
} from "@miragon/bpmn-modeler-core";

import {
    hostNotification,
    hostReply,
    keepAnswering,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";
import {
    TemplatePreferencesChangeParams,
    TemplatePreferencesSnapshot,
} from "./protocol/domain/types";
import { Rpc } from "./transport/adapter/out/Rpc";

const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

const TEMPLATES = [
    { name: "Mail", id: "mail", version: 1, appliesTo: ["bpmn:Task"], properties: [] },
    { name: "Sms", id: "sms", version: 2, appliesTo: ["bpmn:Task"], properties: [] },
];

interface Frame {
    readonly id?: number;
    readonly method: string;
    readonly params: {
        readonly editorId?: string;
        readonly message?: { readonly type: string; readonly hiddenTemplates?: unknown };
    } & Partial<TemplatePreferencesChangeParams>;
}

const isRequest = (method: string) => (frame: Frame) =>
    frame.method === method && frame.id !== undefined;
const isPosted = (type: string) => (frame: Frame) =>
    frame.method === "editor/postMessage" && frame.params.message?.type === type;

/**
 * IntelliJ's two stores and `TemplatePreferenceRouter`: a change merges into
 * its scope at the next revision and is pushed before the answer; a read
 * answers both scopes.
 */
class IntellijTemplateSwitches {
    readonly scopes: Record<ProjectScope, { preferences: TemplatePreferences; revision: number }> =
        {
            project: { preferences: { disabled: [] }, revision: 1 },
            allProjects: { preferences: { disabled: [] }, revision: 1 },
        };
    private readonly answered = new Set<number>();
    private readonly timer: ReturnType<typeof setInterval>;

    constructor(
        private readonly rpc: Rpc,
        frames: readonly Frame[],
    ) {
        this.timer = setInterval(() => {
            for (const frame of frames) {
                if (frame.id === undefined || this.answered.has(frame.id)) continue;
                if (frame.method === "templatePreferences/change") {
                    this.answered.add(frame.id);
                    void this.change(frame.id, frame.params as TemplatePreferencesChangeParams);
                } else if (frame.method === "templatePreferences/read") {
                    this.answered.add(frame.id);
                    void rpc.handleLine(hostReply(frame.id, this.snapshot()));
                }
            }
        }, 5);
    }

    snapshot(): TemplatePreferencesSnapshot {
        const scope = (name: ProjectScope) => ({
            disabled: [...this.scopes[name].preferences.disabled],
            revision: this.scopes[name].revision,
        });
        return { project: scope("project"), allProjects: scope("allProjects") };
    }

    /** Another writer stores this list, and the host pushes it, as another project's change does. */
    async push(scope: ProjectScope, preferences: TemplatePreferences): Promise<void> {
        this.store(scope, preferences);
        await this.rpc.handleLine(
            hostNotification("templatePreferences/didChange", this.snapshot()),
        );
    }

    stop(): void {
        clearInterval(this.timer);
    }

    private store(scope: ProjectScope, preferences: TemplatePreferences): void {
        this.scopes[scope] = { preferences, revision: this.scopes[scope].revision + 1 };
    }

    private async change(id: number, change: TemplatePreferencesChangeParams): Promise<void> {
        const stored = this.scopes[change.scope].preferences;
        const merged = templatePreferencesAfter(stored, change);
        if (templatePreferencesKey(merged) !== templatePreferencesKey(stored)) {
            await this.push(change.scope, merged);
        }
        await this.rpc.handleLine(hostReply(id, this.snapshot()));
    }
}

const disposals: Array<() => Promise<void> | void> = [];

afterEach(async () => {
    for (const dispose of disposals.splice(0)) await dispose();
});

async function openEditor(seedOf?: (configFolder: string) => TemplatePreferencesSnapshot) {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-switches-")));
    const configFolder = `configFolder:${basename(root)}/.camunda`;
    const cacheRoot = await fs.mkdtemp(join(tmpdir(), "bridge-switches-cache-"));
    const templateDir = join(root, ".camunda", "element-templates");
    await fs.mkdir(templateDir, { recursive: true });
    // On macOS the bridge cannot watch a plugins folder that does not exist yet.
    await fs.mkdir(join(root, ".camunda", "plugins"), { recursive: true });
    await fs.writeFile(join(templateDir, "messages.json"), JSON.stringify(TEMPLATES));
    const sourcePath = join(root, "order.bpmn");
    await fs.writeFile(sourcePath, BPMN);
    const frames: Frame[] = [];
    const bridge = createBridge(
        (line) => frames.push(JSON.parse(line)),
        () => {},
        {
            pluginCacheRoot: join(cacheRoot, "plugins"),
            marketplaceCacheRoot: join(cacheRoot, "marketplaces"),
        },
    );
    const host = new IntellijTemplateSwitches(bridge.rpc, frames);
    disposals.push(async () => {
        host.stop();
        bridge.dispose();
        await Promise.all(
            [root, cacheRoot].map((dir) => fs.rm(dir, { recursive: true, force: true })),
        );
    });
    const editorId = `file://${sourcePath}`;
    await bridge.rpc.handleLine(
        hostNotification(
            "session/register",
            registerParams(editorId, root, sourcePath, BPMN, {
                sessionId: 1,
                ...(seedOf && { templatePreferences: seedOf(configFolder) }),
            }),
        ),
    );
    await bridge.rpc.handleLine(
        hostNotification("webview/message", {
            editorId,
            sessionId: 1,
            message: { type: "GetElementTemplatesCommand" },
        }),
    );
    const templates = await waitForFrame(frames, isPosted("ElementTemplatesQuery"));
    return {
        rpc: bridge.rpc,
        addOns: bridge.addOns,
        frames,
        host,
        firstTemplates: templates,
        configFolder,
        scratchDir: cacheRoot,
    };
}

/** The hidden refs the editor got after `fromIndex`, in order. */
function hiddenSince(frames: readonly Frame[], fromIndex: number): unknown[] {
    return frames
        .slice(fromIndex)
        .filter(isPosted("HiddenElementTemplatesQuery"))
        .map((frame) => frame.params.message?.hiddenTemplates);
}

async function attachCatalog(addOns: AddOnsFeature, rpc: Rpc, frames: readonly Frame[]) {
    disposals.push(
        keepAnswering(rpc.handleLine.bind(rpc), frames, "pluginApprovals/read", () => ({
            approvals: [],
            revision: 1,
        })),
        keepAnswering(rpc.handleLine.bind(rpc), frames, "marketplaceState/read", () => ({
            registered: { project: [], allProjects: [] },
            writable: [],
        })),
    );
    const models: AddOnCatalogModel[] = [];
    const view = addOns.attachView((model) => models.push(model), true);
    disposals.push(() => view.dispose());
    await addOns.whenSettled();
    const configSource = (): AddOnSourceView | undefined =>
        models[models.length - 1]?.groups
            .flatMap(({ sources }) => sources)
            .find(({ addOns: rows }) => rows.some(({ kind }) => kind === "elementTemplate"));
    const row = (name: string): AddOnView | undefined =>
        configSource()?.addOns.find((each) => each.name === name);
    return { view, configSource, row };
}

describe("template switches IntelliJ keeps for the user", () => {
    it("hides a template the register seeds as switched off in the first templates it sends", async () => {
        const { firstTemplates } = await openEditor((configFolder) => ({
            project: { disabled: [{ source: configFolder, templateId: "mail" }], revision: 2 },
            allProjects: { disabled: [], revision: 1 },
        }));

        expect(firstTemplates.params.message?.hiddenTemplates).toEqual([
            { id: "mail", version: 1 },
        ]);
    });

    it("reaches an open editor with a host push and ignores an older one", async () => {
        const { rpc, frames, configFolder } = await openEditor();
        const before = frames.length;

        await rpc.handleLine(
            hostNotification("templatePreferences/didChange", {
                project: { disabled: [{ source: configFolder, templateId: "mail" }], revision: 3 },
                allProjects: { disabled: [], revision: 1 },
            }),
        );
        await waitForFrame(frames, isPosted("HiddenElementTemplatesQuery"), { fromIndex: before });
        await rpc.handleLine(
            hostNotification("templatePreferences/didChange", {
                project: { disabled: [], revision: 2 },
                allProjects: { disabled: [], revision: 1 },
            }),
        );
        await settle();

        expect(hiddenSince(frames, before)).toEqual([[{ id: "mail", version: 1 }]]);
        expect(frames.slice(before).filter(isPosted("ElementTemplatesQuery"))).toEqual([]);
    });

    it("offers a template's switch in the catalog and turns it off in the project through the host", async () => {
        const { rpc, frames, addOns, host, configFolder } = await openEditor();
        const catalog = await attachCatalog(addOns, rpc, frames);
        const mail = catalog.row("Mail");
        expect(mail?.actions.map(({ kind }) => kind)).toEqual(["disable"]);
        const before = frames.length;

        await catalog.view.handle({ kind: "disable", addOnId: mail!.id });
        await addOns.whenSettled();

        const change = await waitForFrame(frames, isRequest("templatePreferences/change"));
        expect(change.params).toEqual({
            scope: "project",
            disable: [{ source: configFolder, templateId: "mail" }],
            enable: [],
        });
        expect(host.scopes.project.preferences.disabled).toEqual([
            { source: configFolder, templateId: "mail" },
        ]);
        expect(hiddenSince(frames, before)).toEqual([[{ id: "mail", version: 1 }]]);
        expect(catalog.row("Mail")).toMatchObject({ state: "disabled" });
        expect(catalog.row("Mail")?.actions.map(({ kind }) => kind)).toEqual(["enable"]);
        expect(catalog.row("Sms")).toMatchObject({ state: "enabled" });
    });

    it("turns a config folder's templates off from its source row", async () => {
        const { rpc, frames, addOns, configFolder } = await openEditor();
        const catalog = await attachCatalog(addOns, rpc, frames);
        const source = catalog.configSource();
        expect(source?.actions.map(({ kind }) => kind)).toContain("disableTemplates");
        const before = frames.length;

        await catalog.view.handle({ kind: "disableTemplates", sourceId: source!.id });
        await addOns.whenSettled();

        const change = await waitForFrame(frames, isRequest("templatePreferences/change"));
        expect(change.params).toEqual({
            scope: "project",
            disable: [{ source: configFolder }],
            enable: [],
        });
        expect(hiddenSince(frames, before)).toEqual([
            [
                { id: "mail", version: 1 },
                { id: "sms", version: 2 },
            ],
        ]);
        expect(catalog.configSource()?.actions.map(({ kind }) => kind)).toContain(
            "enableTemplates",
        );
    });

    it("follows a switch another project's bridge changed, in the editor and in the catalog", async () => {
        const { rpc, frames, addOns, host, configFolder } = await openEditor();
        const catalog = await attachCatalog(addOns, rpc, frames);
        const before = frames.length;

        await host.push("project", { disabled: [{ source: configFolder, templateId: "sms" }] });
        await waitForFrame(frames, isPosted("HiddenElementTemplatesQuery"), { fromIndex: before });
        await addOns.whenSettled();

        expect(hiddenSince(frames, before)).toEqual([[{ id: "sms", version: 2 }]]);
        expect(catalog.row("Sms")).toMatchObject({ state: "disabled" });
        expect(catalog.row("Mail")).toMatchObject({ state: "enabled" });
    });

    it("hides a marketplace's templates the user turned off for all projects", async () => {
        const { rpc, frames, host, scratchDir } = await openEditor();
        const folder = join(scratchDir, "acme");
        await fs.mkdir(join(folder, "element-templates"), { recursive: true });
        await fs.writeFile(
            join(folder, "marketplace.json"),
            JSON.stringify({ sources: [{ path: "element-templates" }] }),
        );
        await fs.writeFile(
            join(folder, "element-templates", "audit.json"),
            JSON.stringify({
                name: "Audit",
                id: "audit",
                appliesTo: ["bpmn:Task"],
                properties: [],
            }),
        );
        disposals.push(
            keepAnswering(rpc.handleLine.bind(rpc), frames, "marketplaceState/read", () => ({
                registered: { project: [], allProjects: [folder] },
                writable: [],
            })),
        );
        await rpc.handleLine(
            hostNotification("marketplace/update", { settings: { marketplaces: [folder] } }),
        );
        await waitForFrame(
            frames,
            (frame) =>
                isPosted("ElementTemplatesQuery")(frame) &&
                JSON.stringify(frame.params.message).includes('"audit"'),
        );
        const before = frames.length;

        await host.push("allProjects", { disabled: [{ source: `marketplace:local:${folder}` }] });
        await waitForFrame(frames, isPosted("HiddenElementTemplatesQuery"), { fromIndex: before });

        expect(hiddenSince(frames, before)).toEqual([[{ id: "audit" }]]);
    });
});
