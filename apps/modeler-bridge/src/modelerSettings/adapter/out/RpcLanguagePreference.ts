import { LanguagePreferencePort } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { SettingsSetLanguageParams } from "../../../protocol/domain/types";

export class RpcLanguagePreference implements LanguagePreferencePort {
    constructor(private readonly rpc: Rpc) {}

    async setLanguage(locale: string): Promise<void> {
        await this.rpc.request(METHODS.settingsSetLanguage, {
            locale,
        } satisfies SettingsSetLanguageParams);
    }
}
