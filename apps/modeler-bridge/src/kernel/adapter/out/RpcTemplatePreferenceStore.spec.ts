import { describe, expect, expectTypeOf, it } from "vitest";

import {
    ProjectScope,
    TemplatePreferenceChange,
    TemplateSwitch,
    templatePreferenceChange,
} from "@miragon/bpmn-modeler-core";

import {
    hostErrorReply,
    hostNotification,
    hostReply,
} from "../../../__fixtures__/bridgeHarness";
import { bindHandlers } from "../../../composition/bindHandlers";
import { METHODS } from "../../../protocol/domain/descriptor";
import {
    TemplatePreferencesChangeParams,
    TemplatePreferencesScopeSnapshot,
    TemplatePreferencesSnapshot,
} from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { templatePreferenceHandlers } from "../in/templatePreferenceHandlers";
import { RpcTemplatePreferenceStore } from "./RpcTemplatePreferenceStore";

const SHOP_OFF: TemplateSwitch = { source: "configFolder:shop/.camunda" };
const MAIL_OFF: TemplateSwitch = { source: "configFolder:shop/.camunda", templateId: "mail" };
const ACME_OFF: TemplateSwitch = { source: "marketplace:github:github.com/acme/templates" };

function scope(revision: number, ...disabled: TemplateSwitch[]): TemplatePreferencesScopeSnapshot {
    return { disabled, revision };
}

function bridgeStore() {
    const frames: Array<{ id?: number; method: string; params: unknown }> = [];
    const rpc = new Rpc((line) => frames.push(JSON.parse(line)));
    const store = new RpcTemplatePreferenceStore(rpc);
    bindHandlers(rpc, templatePreferenceHandlers(store));
    return { rpc, store, frames };
}

describe("RpcTemplatePreferenceStore", () => {
    it("speaks the core's scope and switch types on the wire", () => {
        expectTypeOf<TemplatePreferencesChangeParams["scope"]>().toEqualTypeOf<ProjectScope>();
        expectTypeOf<
            TemplatePreferencesChangeParams["disable"][number]
        >().toEqualTypeOf<TemplateSwitch>();
        expectTypeOf<keyof TemplatePreferencesSnapshot>().toEqualTypeOf<ProjectScope>();
        expectTypeOf<
            Pick<TemplatePreferencesChangeParams, keyof TemplatePreferenceChange>
        >().toMatchTypeOf<TemplatePreferenceChange>();
    });

    it("reads the switches another bridge of the IDE stored, once the host pushes them", async () => {
        const { rpc, store } = bridgeStore();

        await rpc.handleLine(
            hostNotification(METHODS.templatePreferencesDidChange, {
                project: scope(2, MAIL_OFF),
                allProjects: scope(3, ACME_OFF),
            }),
        );

        expect(store.read()).toEqual({
            project: { disabled: [MAIL_OFF] },
            allProjects: { disabled: [ACME_OFF] },
        });
    });

    it("sends only the change of its scope and reads both lists the host answers with", async () => {
        const { rpc, store, frames } = bridgeStore();

        const changed = store.change(templatePreferenceChange("allProjects", [ACME_OFF], [MAIL_OFF]));
        await rpc.handleLine(
            hostReply(frames[0].id!, { project: scope(2, SHOP_OFF), allProjects: scope(2, ACME_OFF) }),
        );
        await changed;

        expect(frames[0]).toMatchObject({
            method: METHODS.templatePreferencesChange,
            params: { scope: "allProjects", disable: [ACME_OFF], enable: [MAIL_OFF] },
        });
        expect(store.read()).toEqual({
            project: { disabled: [SHOP_OFF] },
            allProjects: { disabled: [ACME_OFF] },
        });
    });

    it("keeps its switches when the host refuses the change", async () => {
        const { rpc, store, frames } = bridgeStore();
        store.apply({ project: scope(1, MAIL_OFF), allProjects: scope(1) });

        const changed = store.change(templatePreferenceChange("project", [SHOP_OFF], []));
        await rpc.handleLine(hostErrorReply(frames[0].id!, "PropertiesComponent is gone"));

        await expect(changed).rejects.toThrow("PropertiesComponent is gone");
        expect(store.read().project).toEqual({ disabled: [MAIL_OFF] });
    });

    it("keeps a newer pushed list of one scope over an answer the host sent before it and takes the answer's newer other scope", async () => {
        const { rpc, store, frames } = bridgeStore();

        const changed = store.change(templatePreferenceChange("project", [MAIL_OFF], []));
        await rpc.handleLine(
            hostNotification(METHODS.templatePreferencesDidChange, {
                project: scope(3, MAIL_OFF, SHOP_OFF),
                allProjects: scope(1),
            }),
        );
        await rpc.handleLine(
            hostReply(frames[0].id!, { project: scope(2, MAIL_OFF), allProjects: scope(2, ACME_OFF) }),
        );
        await changed;

        expect(store.read()).toEqual({
            project: { disabled: [MAIL_OFF, SHOP_OFF] },
            allProjects: { disabled: [ACME_OFF] },
        });
    });

    it("answers readStored with a newer pushed list over the read the host answered before it", async () => {
        const { rpc, store, frames } = bridgeStore();

        const read = store.readStored();
        await rpc.handleLine(
            hostNotification(METHODS.templatePreferencesDidChange, {
                project: scope(1),
                allProjects: scope(3, ACME_OFF),
            }),
        );
        await rpc.handleLine(
            hostReply(frames[0].id!, { project: scope(1), allProjects: scope(2) }),
        );

        expect(await read).toEqual({
            project: { disabled: [] },
            allProjects: { disabled: [ACME_OFF] },
        });
        expect(frames[0].method).toBe(METHODS.templatePreferencesRead);
    });

    it("keeps a scope's list for a push of the revision it already holds", () => {
        const { store } = bridgeStore();
        store.apply({ project: scope(4, MAIL_OFF), allProjects: scope(4, ACME_OFF) });

        store.apply({ project: scope(4), allProjects: scope(5) });

        expect(store.read()).toEqual({
            project: { disabled: [MAIL_OFF] },
            allProjects: { disabled: [] },
        });
    });

    it("announces a push only when a scope's switches changed", () => {
        const { store } = bridgeStore();
        let announced = 0;
        store.onDidChange(() => announced++);

        store.apply({ project: scope(2, MAIL_OFF), allProjects: scope(1) });
        store.apply({ project: scope(3, MAIL_OFF), allProjects: scope(2) });
        store.apply({ project: scope(4, MAIL_OFF), allProjects: scope(3, ACME_OFF) });

        expect(announced).toBe(2);
    });

    it("hands out copies, so a caller cannot change the mirror", () => {
        const { store } = bridgeStore();
        const pushed = { project: scope(2, { ...MAIL_OFF }), allProjects: scope(1) };
        store.apply(pushed);

        pushed.project.disabled.push(SHOP_OFF);

        expect(store.read().project).toEqual({ disabled: [MAIL_OFF] });
    });
});
