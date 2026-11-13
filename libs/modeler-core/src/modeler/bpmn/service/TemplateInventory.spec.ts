import { describe, expect, it } from "vitest";

import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { createTestHost } from "../../../testing";
import { BpmnElementTemplatesService } from "./BpmnElementTemplatesService";
import { LoadedTemplateDirs } from "./LoadedTemplateDirs";
import { TemplateInventory } from "./TemplateInventory";

const WORK = "/work";
const ROOT_TEMPLATES = `${WORK}/.camunda/element-templates`;
const NESTED_TEMPLATES = `${WORK}/orders/.camunda/element-templates`;

function setUp(files: Record<string, string> = {}) {
    const host = createTestHost({ folders: [WORK], files });
    const artifacts = new ArtifactService(host.workspace, host.settings, host.notifier);
    const loadedTemplateDirs = new LoadedTemplateDirs();
    const templates = new BpmnElementTemplatesService(
        host.store,
        host.documents,
        artifacts,
        host.statusBar,
        host.notifier,
        loadedTemplateDirs,
    );
    return { host, templates, inventory: new TemplateInventory(loadedTemplateDirs, artifacts) };
}

describe("TemplateInventory", () => {
    it("lists every template file below a templates folder, with the config folder it applies from", async () => {
        const { inventory } = setUp({
            [`${ROOT_TEMPLATES}/mail.json`]: JSON.stringify({
                id: "mail",
                name: "Mail",
                version: 2,
            }),
            [`${ROOT_TEMPLATES}/crm/lead.json`]: JSON.stringify([{ id: "lead" }]),
            [`${ROOT_TEMPLATES}/notes.txt`]: "not a template",
        });

        expect(await inventory.templatesIn([ROOT_TEMPLATES, ROOT_TEMPLATES])).toEqual([
            {
                path: `${ROOT_TEMPLATES}/mail.json`,
                sourceDir: `${WORK}/.camunda`,
                reading: { kind: "read", templates: [{ id: "mail", name: "Mail", version: 2 }] },
            },
            {
                path: `${ROOT_TEMPLATES}/crm/lead.json`,
                sourceDir: `${WORK}/.camunda`,
                reading: { kind: "read", templates: [{ id: "lead" }] },
            },
        ]);
    });

    it("lists a file it cannot parse as unreadable, with why", async () => {
        const { inventory } = setUp({ [`${ROOT_TEMPLATES}/broken.json`]: "{ not json" });

        const [listing] = await inventory.templatesIn([ROOT_TEMPLATES]);

        expect(listing.reading).toEqual({
            kind: "unreadable",
            reason: expect.stringMatching(/JSON/),
        });
    });

    it("lists no file of a templates folder that does not exist", async () => {
        const { inventory } = setUp();

        expect(await inventory.templatesIn([ROOT_TEMPLATES])).toEqual([]);
    });

    it("reads the files it is given, a missing one as unreadable", async () => {
        const { inventory } = setUp({ "/cache/a.json": JSON.stringify({ id: "a" }) });

        const listings = await inventory.templatesOf(["/cache/a.json", "/cache/gone.json"]);

        expect(listings.map(({ path, reading }) => [path, reading.kind])).toEqual([
            ["/cache/a.json", "read"],
            ["/cache/gone.json", "unreadable"],
        ]);
    });

    it("places a folder's templates folder in its config folder", () => {
        const { inventory } = setUp();

        expect(inventory.templatesDirOf(`${WORK}/orders`, ".camunda")).toBe(NESTED_TEMPLATES);
    });

    it("knows the templates folders open editors loaded, and says when they change", async () => {
        const { host, templates, inventory } = setUp({
            [`${ROOT_TEMPLATES}/root.json`]: "{}",
            [`${NESTED_TEMPLATES}/near.json`]: "{}",
        });
        let changes = 0;
        inventory.onDidChange(() => changes++);
        const nested = host.openEditor(`${WORK}/orders/order.bpmn`);
        const second = host.openEditor(`${WORK}/orders/other.bpmn`);

        await templates.setElementTemplates(nested.id);
        await templates.setElementTemplates(second.id);
        const loaded = inventory.knownTemplateDirs();
        templates.releaseEditor(nested.id);
        templates.releaseEditor(second.id);

        expect(loaded).toEqual([NESTED_TEMPLATES, ROOT_TEMPLATES]);
        expect(inventory.knownTemplateDirs()).toEqual([]);
        expect(changes).toBe(2);
    });

    it("stops saying so once the subscription is disposed", async () => {
        const { host, templates, inventory } = setUp({ [`${ROOT_TEMPLATES}/root.json`]: "{}" });
        let changes = 0;
        inventory.onDidChange(() => changes++).dispose();

        await templates.setElementTemplates(host.openEditor(`${WORK}/a.bpmn`).id);

        expect(changes).toBe(0);
    });
});
