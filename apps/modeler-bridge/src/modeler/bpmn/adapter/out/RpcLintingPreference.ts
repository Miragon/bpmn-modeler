import { LintingPreferencePort } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../../protocol/domain/descriptor";
import { SettingsSetLintingEnabledParams } from "../../../../protocol/domain/types";

/**
 * The host stores the user's lint choice and pushes it back in the settings
 * snapshot; the bridge never flips its copy.
 */
export class RpcLintingPreference implements LintingPreferencePort {
    constructor(private readonly rpc: Rpc) {}

    async setLintingEnabled(enabled: boolean): Promise<void> {
        await this.rpc.request(METHODS.settingsSetLintingEnabled, {
            enabled,
        } satisfies SettingsSetLintingEnabledParams);
    }
}
