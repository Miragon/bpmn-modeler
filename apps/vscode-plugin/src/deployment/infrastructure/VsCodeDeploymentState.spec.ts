import { describe, expect, it } from "vitest";

import type { DeployedRevision, DeploymentState } from "@miragon/bpmn-modeler-core";

import { InMemoryMemento } from "../../__fixtures__/vscodeStorage";
import { VsCodeDeploymentState } from "./VsCodeDeploymentState";

const LEDGER_KEY = "bpmn-modeler.deployment.ledger";

function revision(fingerprint: string): DeployedRevision {
    return { fingerprint, deployedAt: "2026-10-01T10:00:00.000Z", origin: "local" };
}

const SAVED: DeploymentState = {
    endpoint: "https://engine/api",
    tenantId: "tenant-1",
    authType: "oauth2",
    tokenEndpoint: "https://idp/token",
    audience: "zeebe-api",
    activeTargetName: "dev",
    ledger: { "target:dev::/a.bpmn": revision("f1") },
};

describe("VsCodeDeploymentState", () => {
    it("falls back to ad-hoc defaults in a fresh workspace", () => {
        const state = new VsCodeDeploymentState(new InMemoryMemento());

        expect(state.load()).toEqual({
            endpoint: "",
            tenantId: "",
            authType: "none",
            tokenEndpoint: "",
            audience: "",
            activeTargetName: "",
            ledger: {},
        });
    });

    it("reads the workspace-state keys earlier releases wrote", async () => {
        const memento = new InMemoryMemento();
        await memento.update("bpmn-modeler.deployment.endpoint", "https://engine/api");
        await memento.update("bpmn-modeler.deployment.tenantId", "tenant-1");
        await memento.update("bpmn-modeler.deployment.authType", "oauth2");
        await memento.update("bpmn-modeler.deployment.tokenEndpoint", "https://idp/token");
        await memento.update("bpmn-modeler.deployment.audience", "zeebe-api");
        await memento.update("bpmn-modeler.deployment.activeTargetName", "dev");
        await memento.update(LEDGER_KEY, { "target:dev::/a.bpmn": revision("f1") });

        expect(new VsCodeDeploymentState(memento).load()).toEqual(SAVED);
    });

    it("reads a stored value the core does not know as the default and drops a broken ledger row", async () => {
        const memento = new InMemoryMemento();
        await memento.update("bpmn-modeler.deployment.authType", "kerberos");
        await memento.update("bpmn-modeler.deployment.endpoint", 8080);
        await memento.update(LEDGER_KEY, {
            "target:dev::/a.bpmn": revision("f1"),
            "target:dev::/b.bpmn": { deployedAt: "2026-10-01T10:00:00.000Z" },
        });

        const state = new VsCodeDeploymentState(memento).load();
        expect(state).toMatchObject({ endpoint: "", authType: "none" });
        expect(state.ledger).toEqual({ "target:dev::/a.bpmn": revision("f1") });
    });

    it("persists every saved field so a new session reads it back", async () => {
        const memento = new InMemoryMemento();
        const { ledger, ...fields } = SAVED;

        await new VsCodeDeploymentState(memento).save({ ...fields, ledger: { put: ledger } });

        expect(new VsCodeDeploymentState(memento).load()).toEqual(SAVED);
    });

    it("writes only the keys a patch names", async () => {
        const memento = new InMemoryMemento();
        const state = new VsCodeDeploymentState(memento);

        await state.save({ endpoint: "https://engine/api", activeTargetName: "" });

        expect(memento.keys()).toEqual([
            "bpmn-modeler.deployment.endpoint",
            "bpmn-modeler.deployment.activeTargetName",
        ]);
        expect(memento.get("bpmn-modeler.deployment.activeTargetName")).toBe("");
    });

    it("adds a ledger row without dropping the others and overwrites the same key", async () => {
        const memento = new InMemoryMemento();
        const state = new VsCodeDeploymentState(memento);

        await state.save({ ledger: { put: { "target:dev::/a.bpmn": revision("a1") } } });
        await state.save({ ledger: { put: { "target:dev::/b.bpmn": revision("b1") } } });
        await state.save({ ledger: { put: { "target:dev::/a.bpmn": revision("a2") } } });

        expect(new VsCodeDeploymentState(memento).load().ledger).toEqual({
            "target:dev::/a.bpmn": revision("a2"),
            "target:dev::/b.bpmn": revision("b1"),
        });
    });

    it("deletes only the listed ledger rows and tolerates unknown keys", async () => {
        const memento = new InMemoryMemento();
        const state = new VsCodeDeploymentState(memento);
        await state.save({
            ledger: {
                put: {
                    "target:dev::/a.bpmn": revision("a1"),
                    "target:prod::/a.bpmn": revision("a1"),
                },
            },
        });

        await state.save({
            ledger: { remove: ["target:dev::/a.bpmn", "target:gone::/x.bpmn"] },
        });

        expect(new VsCodeDeploymentState(memento).load().ledger).toEqual({
            "target:prod::/a.bpmn": revision("a1"),
        });
    });
});
