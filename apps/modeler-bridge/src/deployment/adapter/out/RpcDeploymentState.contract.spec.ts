import { RawDeploymentState } from "@miragon/bpmn-modeler-core";
import { describeDeploymentStateContract } from "@miragon/bpmn-modeler-core/testing";

import { METHODS } from "../../../protocol/domain/descriptor";
import { DeploymentSeedParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcDeploymentState } from "./RpcDeploymentState";

const FIELDS = [
    "endpoint",
    "tenantId",
    "authType",
    "tokenEndpoint",
    "audience",
    "activeTargetName",
] as const;

interface RequestFrame {
    readonly method: string;
    readonly params: { readonly patch: Readonly<Record<string, unknown>> };
    readonly id: number;
}

interface LedgerPatchFrame {
    readonly put?: Readonly<Record<string, unknown>>;
    readonly remove?: readonly string[];
}

/**
 * Answers as IntelliJ's `DeploymentRouter` and `IntellijDeploymentState` do: a
 * session opens with the `deploymentState/seed` of what the project stores; a
 * save stores each primitive field as a string, removes ledger rows before it
 * puts and keeps the ledger as JSON text; the reply follows from the writer
 * thread, and a write that throws answers with its message.
 */
class IntellijDeploymentStateHost {
    private readonly properties = new Map<string, string>();
    private rejection: string | undefined;

    open(): RpcDeploymentState {
        const rpc: Rpc = new Rpc((line) => this.receive(rpc, JSON.parse(line) as RequestFrame));
        const deploymentState = new RpcDeploymentState(rpc);
        const seed = JSON.parse(
            JSON.stringify({ state: this.snapshotMap() }),
        ) as DeploymentSeedParams;
        deploymentState.seed(seed.state);
        return deploymentState;
    }

    rejectWrites(reason: string): void {
        this.rejection = reason;
    }

    private receive(rpc: Rpc, frame: RequestFrame): void {
        if (frame.method !== METHODS.deploymentStateSave) {
            throw new Error(`The loopback host does not answer ${frame.method}`);
        }
        setTimeout(() => {
            void rpc.handleLine(
                JSON.stringify({ id: frame.id, ...this.answer(frame.params.patch) }),
            );
        });
    }

    private answer(patch: Readonly<Record<string, unknown>>): { result: null } | { error: string } {
        if (this.rejection !== undefined) return { error: this.rejection };
        this.applyPatch(patch);
        return { result: null };
    }

    private snapshotMap(): RawDeploymentState {
        const ledger = this.properties.get("ledger");
        return {
            ...Object.fromEntries(
                FIELDS.filter((field) => this.properties.has(field)).map((field) => [
                    field,
                    this.properties.get(field),
                ]),
            ),
            ...(ledger === undefined ? {} : { ledger: JSON.parse(ledger) as unknown }),
        };
    }

    private applyPatch(patch: Readonly<Record<string, unknown>>): void {
        for (const field of FIELDS) {
            const value = patch[field];
            if (["string", "number", "boolean"].includes(typeof value)) {
                this.properties.set(field, String(value));
            }
        }
        const ledgerPatch = patch.ledger as LedgerPatchFrame | undefined;
        if (ledgerPatch === undefined) return;
        const ledger = JSON.parse(this.properties.get("ledger") ?? "{}") as Record<string, unknown>;
        for (const key of ledgerPatch.remove ?? []) delete ledger[key];
        Object.assign(ledger, ledgerPatch.put);
        this.properties.set("ledger", JSON.stringify(ledger));
    }
}

describeDeploymentStateContract("RpcDeploymentState against a loopback IntelliJ host", async () => {
    const host = new IntellijDeploymentStateHost();
    return {
        deploymentState: host.open(),
        reopen: () => host.open(),
        rejectWrites: (reason) => host.rejectWrites(reason),
    };
});
