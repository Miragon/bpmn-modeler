import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../__fixtures__/vscodeCompositionFake"));

import { ExtensionContext, Uri, workspace } from "vscode";

import { BpmnElementTemplatesService } from "@miragon/bpmn-modeler-core";

import { marketplacePreferenceKeyOf, parseMarketplaceUrl } from "@miragon/bpmn-modeler-core";

import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { resetVscodeWindow, vscodeWindow } from "../__fixtures__/vscodeWindowFake";
import { setContext } from "../shared/adapter/out/extensionContext";
import { buildSharedDeps } from "./sharedDeps";
import * as templateMarketplaceFeature from "./templateMarketplaceFeature";

const ACME_URL = "https://github.com/acme/templates";
const ACME_TEMPLATE = "/global-storage/marketplaces/acme/mail.json";

function createExtensionContext(): ExtensionContext {
    return {
        subscriptions: [],
        globalState: new InMemoryMemento(),
        workspaceState: new InMemoryMemento(),
        globalStorageUri: Uri.file("/global-storage"),
    } as unknown as ExtensionContext;
}

function registerInUserSettings(location: string): void {
    const configuration = workspace.getConfiguration("");
    const inspect = <T>(key: string) =>
        key === "marketplaces" ? { key, globalValue: [location] as T } : undefined;
    vi.spyOn(workspace, "getConfiguration").mockReturnValue({ ...configuration, inspect });
}

afterEach(() => {
    vi.restoreAllMocks();
    resetVscodeWindow();
});

describe("VS Code's template marketplace feature", () => {
    it("groups the cached templates by registered marketplace, so switching one off hides it", async () => {
        const context = createExtensionContext();
        setContext(context);
        registerInUserSettings(ACME_URL);
        const { marketplaceSvc, templateSources } = templateMarketplaceFeature.register(
            context,
            buildSharedDeps(context),
        );
        const acme = parseMarketplaceUrl(ACME_URL);
        vi.spyOn(marketplaceSvc, "cachedTemplatePathsByRegistration").mockResolvedValue(
            new Map([[acme.id, [ACME_TEMPLATE]]]),
        );

        expect(await templateSources.getCachedTemplateSources()).toEqual([
            {
                source: { key: marketplacePreferenceKeyOf(acme.location), scope: "allProjects" },
                paths: [ACME_TEMPLATE],
            },
        ]);
    });

    it("offers the update at start when this workspace has fetched nothing for a marketplace", async () => {
        const context = createExtensionContext();
        setContext(context);
        registerInUserSettings(ACME_URL);
        const deps = buildSharedDeps(context);
        const { marketplaceSvc } = templateMarketplaceFeature.register(context, deps);

        templateMarketplaceFeature.registerCommands(context, deps, {
            marketplaceSvc,
            templatesSvc: {} as BpmnElementTemplatesService,
        });

        await vi.waitFor(() =>
            expect(vscodeWindow.toasts.map(({ message, labels }) => ({ message, labels }))).toEqual(
                [
                    {
                        message:
                            'The element templates of the marketplace "https://github.com/acme/templates" are not fetched in this workspace yet.',
                        labels: ["Update marketplaces"],
                    },
                ],
            ),
        );
    });
});
