import { describe, expect, it } from "vitest";

import type { DeployedRevision } from "@miragon/bpmn-modeler-core";

import { InMemoryMemento } from "../../__fixtures__/vscodeStorage";
import { VsCodeDeploymentState } from "./VsCodeDeploymentState";

const LEDGER_KEY = "bpmn-modeler.deployment.ledger";

function revision(fingerprint: string): DeployedRevision {
    return { fingerprint, deployedAt: "2026-10-01T10:00:00.000Z", origin: "local" };
}

describe("VsCodeDeploymentState", () => {
    it("falls back to ad-hoc defaults in a fresh workspace", () => {
        const state = new VsCodeDeploymentState(new InMemoryMemento());

        expect(state.getEndpoint()).toBe("");
        expect(state.getTenantId()).toBe("");
        expect(state.getAuthType()).toBe("none");
        expect(state.getTokenEndpoint()).toBe("");
        expect(state.getAudience()).toBe("");
        expect(state.getActiveTargetName()).toBe("");
        expect(state.getDeployedRevision("any")).toBeUndefined();
        expect(state.listLedgerKeys()).toEqual([]);
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

        const state = new VsCodeDeploymentState(memento);

        expect(state.getEndpoint()).toBe("https://engine/api");
        expect(state.getTenantId()).toBe("tenant-1");
        expect(state.getAuthType()).toBe("oauth2");
        expect(state.getTokenEndpoint()).toBe("https://idp/token");
        expect(state.getAudience()).toBe("zeebe-api");
        expect(state.getActiveTargetName()).toBe("dev");
        expect(state.getDeployedRevision("target:dev::/a.bpmn")).toEqual(revision("f1"));
    });

    it("persists every saved field so a new session reads it back", async () => {
        const memento = new InMemoryMemento();
        const state = new VsCodeDeploymentState(memento);

        await state.save("https://engine/api", "tenant-1");
        await state.saveAuthType("basic");
        await state.saveOAuth2Config("https://idp/token", "zeebe-api");
        await state.saveActiveTargetName("prod");

        const nextSession = new VsCodeDeploymentState(memento);
        expect(nextSession.getEndpoint()).toBe("https://engine/api");
        expect(nextSession.getTenantId()).toBe("tenant-1");
        expect(nextSession.getAuthType()).toBe("basic");
        expect(nextSession.getTokenEndpoint()).toBe("https://idp/token");
        expect(nextSession.getAudience()).toBe("zeebe-api");
        expect(nextSession.getActiveTargetName()).toBe("prod");
    });

    it("adds a ledger row without dropping the others and overwrites the same key", async () => {
        const memento = new InMemoryMemento();
        const state = new VsCodeDeploymentState(memento);

        await state.saveDeployedRevision("target:dev::/a.bpmn", revision("a1"));
        await state.saveDeployedRevision("target:dev::/b.bpmn", revision("b1"));
        await state.saveDeployedRevision("target:dev::/a.bpmn", revision("a2"));

        const nextSession = new VsCodeDeploymentState(memento);
        expect(nextSession.listLedgerKeys()).toEqual([
            "target:dev::/a.bpmn",
            "target:dev::/b.bpmn",
        ]);
        expect(nextSession.getDeployedRevision("target:dev::/a.bpmn")).toEqual(revision("a2"));
        expect(nextSession.getDeployedRevision("target:dev::/b.bpmn")).toEqual(revision("b1"));
    });

    it("deletes only the listed ledger rows and tolerates unknown keys", async () => {
        const memento = new InMemoryMemento();
        const state = new VsCodeDeploymentState(memento);
        await state.saveDeployedRevision("target:dev::/a.bpmn", revision("a1"));
        await state.saveDeployedRevision("target:prod::/a.bpmn", revision("a1"));

        await state.deleteDeployedRevisions(["target:dev::/a.bpmn", "target:gone::/x.bpmn"]);

        expect(new VsCodeDeploymentState(memento).listLedgerKeys()).toEqual([
            "target:prod::/a.bpmn",
        ]);
    });
});
