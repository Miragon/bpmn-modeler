import { describe, expect, it } from "vitest";

import type {
    DeployedRevision,
    DeploymentState,
    DeploymentStatePatch,
} from "@miragon/bpmn-modeler-core";
import { describeDeploymentStateContract } from "@miragon/bpmn-modeler-core/testing";

import { FailingMemento, InMemoryMemento } from "../../../__fixtures__/vscodeStorage";
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

const OLD_CONNECTION: DeploymentStatePatch = {
    endpoint: "https://old.example",
    tenantId: "tenant-1",
    authType: "none",
    tokenEndpoint: "",
    audience: "",
};

const NEW_OAUTH2_CONNECTION: DeploymentStatePatch = {
    endpoint: "https://new.example",
    tenantId: "tenant-2",
    authType: "oauth2",
    tokenEndpoint: "https://idp/token",
    audience: "zeebe-api",
};

function connectionOf({ endpoint, tenantId, authType, tokenEndpoint, audience }: DeploymentState) {
    return { endpoint, tenantId, authType, tokenEndpoint, audience };
}

describe("VsCodeDeploymentState", () => {
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

    it("carries the keys earlier releases wrote into the first save", async () => {
        const memento = new InMemoryMemento();
        await memento.update("bpmn-modeler.deployment.endpoint", "https://engine/api");
        await memento.update("bpmn-modeler.deployment.tenantId", "tenant-1");
        await memento.update(LEDGER_KEY, { "target:dev::/a.bpmn": revision("f1") });

        await new VsCodeDeploymentState(memento).save({ activeTargetName: "dev" });

        expect(new VsCodeDeploymentState(memento).load()).toMatchObject({
            endpoint: "https://engine/api",
            tenantId: "tenant-1",
            activeTargetName: "dev",
            ledger: { "target:dev::/a.bpmn": revision("f1") },
        });
    });

    it("reads no key an earlier release wrote once a save has stored the state", async () => {
        const memento = new InMemoryMemento();
        await new VsCodeDeploymentState(memento).save({ endpoint: "https://engine/api" });

        await memento.update("bpmn-modeler.deployment.endpoint", "https://older/api");
        await memento.update("bpmn-modeler.deployment.authType", "basic");

        expect(new VsCodeDeploymentState(memento).load()).toMatchObject({
            endpoint: "https://engine/api",
            authType: "none",
        });
    });

    it.each(
        [0, 1, 2, 3, 4].flatMap((writesBeforeFailure) => [
            [writesBeforeFailure, false] as const,
            [writesBeforeFailure, true] as const,
        ]),
    )(
        "stores a connection whole or not at all when the workspace state rejects after %i writes (rejected value kept in memory: %s)",
        async (writesBeforeFailure, keepsRejectedValue) => {
            const memento = new FailingMemento(keepsRejectedValue);
            await new VsCodeDeploymentState(memento).save(OLD_CONNECTION);
            const oldConnection = connectionOf(new VsCodeDeploymentState(memento).load());
            memento.failAfter(writesBeforeFailure);

            await new VsCodeDeploymentState(memento)
                .save(NEW_OAUTH2_CONNECTION)
                .catch(() => undefined);

            expect([oldConnection, NEW_OAUTH2_CONNECTION]).toContainEqual(
                connectionOf(new VsCodeDeploymentState(memento).load()),
            );
        },
    );
});

describeDeploymentStateContract("VsCodeDeploymentState", async () => {
    // Keeps a rejected value in memory, as VS Code's ExtensionMemento does.
    const workspaceState = new FailingMemento(true);
    return {
        deploymentState: new VsCodeDeploymentState(workspaceState),
        reopen: () => new VsCodeDeploymentState(workspaceState),
        rejectWrites: (reason) => workspaceState.failAfter(0, reason),
    };
});
