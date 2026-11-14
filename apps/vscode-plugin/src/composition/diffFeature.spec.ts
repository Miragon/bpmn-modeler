import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ hasTextDiffTabs: true }));

vi.mock("vscode", async () => {
    const fake = await import("../__fixtures__/vscodeCompositionFake");
    return {
        ...fake,
        get TabInputTextDiff() {
            return host.hasTextDiffTabs ? fake.TabInputTextDiff : undefined;
        },
    };
});

import { ExtensionContext, Uri } from "vscode";

import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { setContext } from "../shared/adapter/out/extensionContext";
import * as diffFeature from "./diffFeature";
import { buildSharedDeps } from "./sharedDeps";

function registeredDiffFeature() {
    const context = {
        subscriptions: [],
        globalState: new InMemoryMemento(),
        workspaceState: new InMemoryMemento(),
        secrets: {},
        globalStorageUri: Uri.file("/global-storage"),
        extensionUri: Uri.file("/extension"),
    } as unknown as ExtensionContext;
    setContext(context);
    return diffFeature.register(context, buildSharedDeps(context));
}

describe("the diff feature", () => {
    beforeEach(() => {
        host.hasTextDiffTabs = true;
    });

    it("shows an element's XML changes where the host has text diff tabs", () => {
        const { diffController } = registeredDiffFeature();

        expect(diffController.paneRoutes.routeOf("ShowElementXmlChangesCommand")).toStrictEqual({
            kind: "handled",
        });
    });

    it("leaves an element's XML changes out where the host lacks text diff tabs, as Theia may", () => {
        host.hasTextDiffTabs = false;

        const { diffController } = registeredDiffFeature();

        expect(diffController.paneRoutes.routeOf("ShowElementXmlChangesCommand")).toStrictEqual({
            kind: "ignored",
            reason: "the host shows no element XML diff",
        });
    });
});
