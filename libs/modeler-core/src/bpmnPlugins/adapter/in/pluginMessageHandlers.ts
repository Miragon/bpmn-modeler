import { Command } from "@miragon/bpmn-modeler-shared";

import { MessageHandler } from "../../../editorSession/service/WebviewMessageRouter";
import { BpmnPluginService } from "../../service/BpmnPluginService";

/** `GetBpmnPluginsCommand` → answer with the approved plugins, then ask about the rest. */
export function getBpmnPluginsHandler(plugins: BpmnPluginService): MessageHandler {
    return async (_message: Command, editorId: string) => {
        await plugins.answerPluginRequest(editorId);
    };
}
