import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createModeler } from "../createModeler";
import type { BpmnModeler } from "../modeler";
import { START_EVENT_XML } from "../__fixtures__/bpmnXml";
import { mountWithPanel, removeMounts } from "../__fixtures__/surfaceMount";
import { buildWithPluginsOrWithout } from "./buildWithPlugins";
import { loadPlugins } from "./loadPlugins";

type PluginWindow = Window & { plugins?: unknown };

const objectUrls: string[] = [];
const modelers: BpmnModeler[] = [];

function scriptUrl(code: string): string {
    return objectUrl(code, "text/javascript");
}

function objectUrl(content: string, type: string): string {
    const url = URL.createObjectURL(new Blob([content], { type }));
    objectUrls.push(url);
    return url;
}

/** A script that registers the way `camunda-modeler-plugin-helpers` does. */
function registering(type: string, plugin: string): string {
    return `(window.plugins = window.plugins || []).push({ type: ${JSON.stringify(type)}, plugin: ${plugin} });`;
}

const ACME_MODULE = `(function () {
  function AcmeService(eventBus) { this.eventBus = eventBus; }
  AcmeService.$inject = ['eventBus'];
  ${registering("bpmn.modeler.additionalModules", "{ __init__: ['acmeService'], acmeService: ['type', AcmeService] }")}
})();`;

const ACME_MODDLE = registering(
    "bpmn.modeler.moddleExtension",
    `{ name: 'Acme', prefix: 'acme', uri: 'http://acme.example/schema', xml: { tagAlias: 'lowerCase' },
       types: [{ name: 'Note', superClass: ['Element'], properties: [{ name: 'text', isAttr: true, type: 'String' }] }] }`,
);

const BROKEN_MODULE = registering(
    "bpmn.modeler.additionalModules",
    `{ __init__: ['brokenService'], brokenService: ['type', function () { throw new Error('broken on construction'); }] }`,
);

afterEach(() => {
    for (const modeler of modelers.splice(0)) {
        modeler.destroy();
    }
    removeMounts();
    for (const url of objectUrls.splice(0)) {
        URL.revokeObjectURL(url);
    }
    for (const link of document.head.querySelectorAll("link[data-test-plugin-style]")) {
        link.remove();
    }
});

describe("loadPlugins", () => {
    it("collects each plugin's registrations under its own name", async () => {
        const loaded = await loadPlugins([
            { name: "acme", scriptUrl: scriptUrl(ACME_MODULE) },
            { name: "acme-moddle", scriptUrl: scriptUrl(ACME_MODDLE) },
        ]);

        expect(
            loaded.plugins.map(({ name, registrations }) => ({
                name,
                types: registrations.map((registration) => registration.type),
            })),
        ).toEqual([
            { name: "acme", types: ["bpmn.modeler.additionalModules"] },
            { name: "acme-moddle", types: ["bpmn.modeler.moddleExtension"] },
        ]);
        expect(loaded.failures).toEqual([]);
    });

    it.each([
        ["replaces the registry", "window.plugins = 'not a list';"],
        [
            "pushes malformed entries",
            "window.plugins.push(42, { type: 'no plugin' }, { plugin: {} });",
        ],
    ])("counts nothing from a script that %s", async (_kind, code) => {
        const loaded = await loadPlugins([{ name: "odd", scriptUrl: scriptUrl(code) }]);

        expect(loaded.plugins).toEqual([{ name: "odd", registrations: [] }]);
        expect(loaded.failures).toEqual([]);
    });

    it("leaves out a plugin whose script throws and still loads the next one", async () => {
        const loaded = await loadPlugins([
            { name: "throws", scriptUrl: scriptUrl("throw new Error('plugin exploded');") },
            { name: "acme", scriptUrl: scriptUrl(ACME_MODULE) },
        ]);

        expect(loaded.failures).toEqual([{ plugin: "throws", reason: "plugin exploded" }]);
        expect(loaded.plugins.map((plugin) => plugin.name)).toEqual(["acme"]);
    });

    describe("beside a page-wide error listener, as a host's error forwarding adds before any plugin loads", () => {
        const pageWideErrors: ErrorEvent[] = [];
        const recordPageWideError = (event: ErrorEvent) => pageWideErrors.push(event);
        /** A cancelled error is the canceller's to report, so the forwarding skips it. */
        const claimOf = (event: ErrorEvent) => ({
            message: event.message,
            claimed: event.defaultPrevented,
        });

        beforeEach(() => {
            pageWideErrors.length = 0;
            window.addEventListener("error", recordPageWideError);
        });

        afterEach(() => {
            window.removeEventListener("error", recordPageWideError);
        });

        it("claims a throwing plugin's error, so only the loader reports it", async () => {
            const loaded = await loadPlugins([
                { name: "throws", scriptUrl: scriptUrl("throw new Error('plugin exploded');") },
            ]);

            expect(loaded.failures).toEqual([{ plugin: "throws", reason: "plugin exploded" }]);
            expect(pageWideErrors.map(claimOf)).toEqual([
                { message: expect.stringContaining("plugin exploded"), claimed: true },
            ]);
        });

        it("claims only the error it reports while a plugin's script runs", async () => {
            const loaded = await loadPlugins([
                {
                    name: "throws twice",
                    scriptUrl: scriptUrl(
                        "window.dispatchEvent(new ErrorEvent('error', { message: 'first', cancelable: true })); throw new Error('second');",
                    ),
                },
            ]);

            expect(loaded.failures).toEqual([{ plugin: "throws twice", reason: "first" }]);
            expect(pageWideErrors.map(claimOf)).toEqual([
                { message: "first", claimed: true },
                { message: expect.stringContaining("second"), claimed: false },
            ]);
        });

        it("leaves an error raised after the plugins loaded to the page", async () => {
            await loadPlugins([
                { name: "throws", scriptUrl: scriptUrl("throw new Error('plugin exploded');") },
            ]);
            pageWideErrors.length = 0;

            window.dispatchEvent(
                new ErrorEvent("error", { message: "later failure", cancelable: true }),
            );

            expect(pageWideErrors.map(claimOf)).toEqual([
                { message: "later failure", claimed: false },
            ]);
        });
    });

    it("leaves out a plugin whose script does not load", async () => {
        const missingUrl = new URL("/__no-such-plugin__/plugin.js", window.location.href).href;

        const loaded = await loadPlugins([{ name: "missing", scriptUrl: missingUrl }]);

        expect(loaded.plugins).toEqual([]);
        expect(loaded.failures).toEqual([
            { plugin: "missing", reason: expect.stringContaining("its script did not load") },
        ]);
    });

    it("gives the page its own window.plugins back afterwards", async () => {
        const pageRegistry = [{ type: "page", plugin: {} }];
        (window as PluginWindow).plugins = pageRegistry;

        await loadPlugins([
            { name: "acme", scriptUrl: scriptUrl(ACME_MODULE) },
            { name: "throws", scriptUrl: scriptUrl("throw new Error('x');") },
        ]);

        expect((window as PluginWindow).plugins).toBe(pageRegistry);
        delete (window as PluginWindow).plugins;
    });

    it("adds one stylesheet link for a plugin with a style", async () => {
        const styleUrl = objectUrl(".acme-note { color: rgb(1, 2, 3); }", "text/css");

        await loadPlugins([{ name: "styled", scriptUrl: scriptUrl(ACME_MODULE), styleUrl }]);

        const links = [...document.head.querySelectorAll<HTMLLinkElement>("link")].filter(
            (link) => link.href === styleUrl,
        );
        links.forEach((link) => link.setAttribute("data-test-plugin-style", ""));
        expect(links.map((link) => link.rel)).toEqual(["stylesheet"]);
    });

    it("keeps two loads that run at the same time apart", async () => {
        const pageRegistry: unknown[] = [];
        (window as PluginWindow).plugins = pageRegistry;

        const [first, second] = await Promise.all([
            loadPlugins([
                { name: "throws", scriptUrl: scriptUrl("throw new Error('plugin exploded');") },
                { name: "acme", scriptUrl: scriptUrl(ACME_MODULE) },
            ]),
            loadPlugins([{ name: "acme-moddle", scriptUrl: scriptUrl(ACME_MODDLE) }]),
        ]);

        expect(first.failures).toEqual([{ plugin: "throws", reason: "plugin exploded" }]);
        expect(first.plugins.flatMap((plugin) => plugin.registrations.map((r) => r.type))).toEqual([
            "bpmn.modeler.additionalModules",
        ]);
        expect(second.failures).toEqual([]);
        expect(second.plugins.flatMap((plugin) => plugin.registrations.map((r) => r.type))).toEqual(
            ["bpmn.modeler.moddleExtension"],
        );
        expect((window as PluginWindow).plugins).toBe(pageRegistry);
        delete (window as PluginWindow).plugins;
    });
});

describe("a modeler built with the loaded plugins", () => {
    async function modelerWith(sources: Parameters<typeof loadPlugins>[0]) {
        const loaded = await loadPlugins(sources);
        const { container, panel } = mountWithPanel();
        const fallbackErrors: unknown[] = [];
        const modeler = await buildWithPluginsOrWithout(
            loaded,
            "c7",
            (modules) =>
                createModeler(container, {
                    engine: "c7",
                    propertiesPanel: { parent: panel },
                    ...modules,
                }),
            (error) => fallbackErrors.push(error),
        );
        modelers.push(modeler);
        return { modeler, fallbackErrors };
    }

    it("resolves the plugin's service and reads the plugin's moddle types", async () => {
        const { modeler, fallbackErrors } = await modelerWith([
            { name: "acme", scriptUrl: scriptUrl(ACME_MODULE) },
            { name: "acme-moddle", scriptUrl: scriptUrl(ACME_MODDLE) },
        ]);
        await modeler.loadDiagram(START_EVENT_XML);

        const acmeService = modeler.getService<{ eventBus: unknown }>("acmeService");
        const moddle = modeler.getService<{
            create(type: string, attrs: object): { $instanceOf(type: string): boolean };
        }>("moddle");

        expect(acmeService.eventBus).toBe(modeler.getService("eventBus"));
        expect(moddle.create("acme:Note", { text: "hi" }).$instanceOf("acme:Note")).toBe(true);
        expect(fallbackErrors).toEqual([]);
    });

    it("opens without the plugins when one breaks the construction", async () => {
        const { modeler, fallbackErrors } = await modelerWith([
            { name: "broken", scriptUrl: scriptUrl(BROKEN_MODULE) },
        ]);

        await modeler.loadDiagram(START_EVENT_XML);

        expect(fallbackErrors).toEqual([new Error("broken on construction")]);
        expect(() => modeler.getService("brokenService")).toThrow();
    });
});
