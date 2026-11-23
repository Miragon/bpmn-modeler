import { METHODS } from "../../../protocol/domain/descriptor";
import { TemplatePreferencesSnapshot } from "../../../protocol/domain/kernelProtocol";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import { TemplatePreferencesMirror } from "../../port/TemplatePreferencesMirror";

/**
 * The template switches the host stores for the user, pushed after a change:
 * an all-projects change from any bridge of the IDE, a project change from
 * this project's.
 *
 * RPC (Host → Core): templatePreferences/didChange.
 */
export function templatePreferenceHandlers(mirror: TemplatePreferencesMirror): RpcHandlerTable {
    return {
        [METHODS.templatePreferencesDidChange]: (params: TemplatePreferencesSnapshot) => {
            mirror.apply(params);
        },
    };
}
