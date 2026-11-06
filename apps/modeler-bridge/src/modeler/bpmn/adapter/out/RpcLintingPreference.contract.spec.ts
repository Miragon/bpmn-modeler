import { DEFAULT_MODELER_SETTINGS, RawModelerSettings } from "@miragon/bpmn-modeler-core";
import { describeLintingPreferenceContract } from "@miragon/bpmn-modeler-core/testing";

import { bindHandlers } from "../../../../composition/bindHandlers";
import { BridgeSettings } from "../../../../kernel/adapter/out/BridgeSettings";
import { METHODS } from "../../../../protocol/domain/descriptor";
import { SettingsSetLintingEnabledParams } from "../../../../protocol/domain/types";
import { Rpc } from "../../../../transport/adapter/out/Rpc";
import { bpmnEditorHandlers } from "../in/bpmnEditorHandlers";
import { RpcLintingPreference } from "./RpcLintingPreference";

interface RequestFrame {
    readonly method: string;
    readonly params: Partial<SettingsSetLintingEnabledParams>;
    readonly id: number;
}

/** One project's bridge, wired as `bpmnEditorFeature` wires it. */
interface ProjectBridge {
    readonly rpc: Rpc;
    readonly preference: RpcLintingPreference;
    readonly settings: BridgeSettings;
}

/**
 * Answers `settings/setLintingEnabled` as IntelliJ's `SettingsRouter` does: it
 * stores the choice in the application's properties, which every project
 * shares, pushes the whole snapshot (`ModelerSettingsStore.snapshotMap`) to
 * every running bridge over `settings/didChange` and only then acks; a request
 * without a boolean `enabled` fails. Each frame reaches the bridge as the
 * stdio binding hands it over, without waiting for the one before.
 */
class IntellijSettingsHost {
    private lintingEnabled = true;
    private readonly bridges: ProjectBridge[] = [];

    async openProject(): Promise<ProjectBridge> {
        const settings = new BridgeSettings();
        const rpc: Rpc = new Rpc((line) => this.receive(rpc, JSON.parse(line) as RequestFrame));
        const preference = new RpcLintingPreference(rpc);
        bindHandlers(
            rpc,
            bpmnEditorHandlers({
                settingsMirror: settings,
                settings,
                lintingPreference: preference,
                onSettingsApplied: () => undefined,
            }),
        );
        const bridge = { rpc, preference, settings };
        this.bridges.push(bridge);
        // A project's first `session/register` carries the same snapshot.
        await rpc.handleLine(this.settingsPush());
        return bridge;
    }

    private receive(rpc: Rpc, frame: RequestFrame): void {
        if (frame.method !== METHODS.settingsSetLintingEnabled) {
            throw new Error(`The loopback host does not answer ${frame.method}`);
        }
        setTimeout(() => {
            const { enabled } = frame.params;
            if (typeof enabled !== "boolean") {
                void rpc.handleLine(
                    JSON.stringify({
                        id: frame.id,
                        error: "Param 'enabled' is missing or not of the expected type",
                    }),
                );
                return;
            }
            this.lintingEnabled = enabled;
            for (const bridge of this.bridges) {
                void bridge.rpc.handleLine(this.settingsPush());
            }
            void rpc.handleLine(JSON.stringify({ id: frame.id, result: null }));
        });
    }

    private settingsPush(): string {
        const settings: RawModelerSettings = {
            ...DEFAULT_MODELER_SETTINGS,
            lintingEnabled: this.lintingEnabled,
        };
        return JSON.stringify({ method: METHODS.settingsDidChange, params: { settings } });
    }
}

describeLintingPreferenceContract(
    "RpcLintingPreference against a loopback IntelliJ host",
    async () => {
        const host = new IntellijSettingsHost();
        const { preference, settings } = await host.openProject();
        return {
            preference,
            settings,
            openAnotherProject: async () => (await host.openProject()).settings,
        };
    },
);
