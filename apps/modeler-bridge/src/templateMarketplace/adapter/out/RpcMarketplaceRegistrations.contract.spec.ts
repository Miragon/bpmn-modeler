import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MarketplaceSettingsEntry, RegistrationsByScope } from "@miragon/bpmn-modeler-core";
import { describeMarketplaceRegistrationsContract } from "@miragon/bpmn-modeler-core/testing";

import { bindHandlers } from "../../../composition/bindHandlers";
import { createStdinHandler } from "../../../composition/stdioBinding";
import { BridgeSettings } from "../../../kernel/adapter/out/BridgeSettings";
import { bpmnEditorHandlers } from "../../../modeler/bpmn/adapter/in/bpmnEditorHandlers";
import { RpcLintingPreference } from "../../../modeler/bpmn/adapter/out/RpcLintingPreference";
import { METHODS } from "../../../protocol/domain/descriptor";
import {
    MarketplaceStateReadResult,
    MarketplaceStateRemoveParams,
    MarketplaceStateSaveParams,
} from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcMarketplaceRegistrations } from "./RpcMarketplaceRegistrations";

/** `MarketplaceRouter.WRITABLE_SCOPES`, which `MarketplaceRouterTest` holds to this file. */
const INTELLIJ_WRITABLE = JSON.parse(
    readFileSync(resolve(__dirname, "../../../__fixtures__/intellijWritableScopes.json"), "utf8"),
) as MarketplaceStateReadResult["writable"];

interface CoreFrame {
    readonly id: number;
    readonly method: string;
    readonly params: unknown;
}

/** Gson's `asString` on a JSON object throws, which the host answers with an error reply. */
function asString(entry: MarketplaceSettingsEntry): string {
    if (typeof entry !== "string") throw new Error("JsonObject");
    return entry;
}

/**
 * IntelliJ's `MarketplaceRouter` over its application and project stores, as
 * the Kotlin handlers answer: a store holds URL strings only, a write pushes
 * the merged list in `settings/didChange` before it acks, and a store that
 * throws turns into an error reply.
 */
class IntellijMarketplaceStores {
    private readonly application: string[] = [];
    private readonly project: string[] = [];
    private refusal: string | undefined;

    constructor(
        stored: RegistrationsByScope,
        private readonly sendToBridge: (chunk: string) => void,
    ) {
        this.store(stored);
    }

    store(stored: RegistrationsByScope): void {
        this.application.splice(0, Infinity, ...stored.allProjects.map(asString));
        this.project.splice(0, Infinity, ...stored.project.map(asString));
    }

    refuseWrites(reason: string): void {
        this.refusal = reason;
    }

    // Kotlin answers from its reader thread, after the request left the bridge.
    receive(line: string): void {
        const frame = JSON.parse(line) as CoreFrame;
        setTimeout(() => {
            const answer = this.frames(frame).map((reply) => `${JSON.stringify(reply)}\n`);
            this.sendToBridge(answer.join(""));
        }, 0);
    }

    private frames({ id, method, params }: CoreFrame): object[] {
        try {
            switch (method) {
                case METHODS.marketplaceStateRead:
                    return [{ id, result: this.readState() }];
                case METHODS.marketplaceStateSave:
                    this.save(params as MarketplaceStateSaveParams);
                    return [this.settingsPush(), { id, result: null }];
                case METHODS.marketplaceStateRemove:
                    this.remove(params as MarketplaceStateRemoveParams);
                    return [this.settingsPush(), { id, result: null }];
                default:
                    throw new Error(`No handler for ${method}`);
            }
        } catch (error) {
            return [{ id, error: (error as Error).message }];
        }
    }

    private readState(): MarketplaceStateReadResult {
        return {
            registered: { project: [...this.project], allProjects: [...this.application] },
            writable: INTELLIJ_WRITABLE,
        };
    }

    private save({ location, scope }: MarketplaceStateSaveParams): void {
        this.throwIfRefused();
        const store = scope === "allProjects" ? this.application : this.project;
        if (!store.includes(location)) store.push(location);
    }

    private remove({ entries }: MarketplaceStateRemoveParams): void {
        const removed = new Set(entries.map(asString));
        this.throwIfRefused();
        for (const store of [this.application, this.project]) {
            store.splice(0, Infinity, ...store.filter((entry) => !removed.has(entry)));
        }
    }

    private throwIfRefused(): void {
        if (this.refusal) throw new Error(this.refusal);
    }

    /** `ModelerSettingsStore.snapshotMap`, of which only the merged list matters here. */
    private settingsPush(): object {
        const merged = [...new Set([...this.application, ...this.project])];
        return { method: METHODS.settingsDidChange, params: { settings: { marketplaces: merged } } };
    }
}

describeMarketplaceRegistrationsContract(
    "RpcMarketplaceRegistrations over a loopback to IntelliJ's stores",
    async (stored) => {
        const settings = new BridgeSettings();
        let fromHost: (chunk: string) => void = () => undefined;
        const host = new IntellijMarketplaceStores(stored, (chunk) => fromHost(chunk));
        const rpc = new Rpc((line) => host.receive(line));
        fromHost = createStdinHandler(rpc, (text) => {
            throw new Error(text);
        });
        bindHandlers(
            rpc,
            bpmnEditorHandlers({
                settingsMirror: settings,
                settings,
                lintingPreference: new RpcLintingPreference(rpc),
                onSettingsApplied: () => undefined,
            }),
        );
        return {
            registrations: new RpcMarketplaceRegistrations(rpc),
            settingsRead: () => settings.getMarketplaces(),
            refuseWrites: (reason) => host.refuseWrites(reason),
            storeElsewhere: (changed) => host.store(changed),
        };
    },
);
