/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 *
 * Delta from upstream (the viewer blocker): upstream injects `commandStack`
 * directly, which a readonly `NavigatedViewer` never registers — construction
 * throws. Here `CommandInitializer` injects the `injector` and resolves
 * `commandStack` optionally, registering the multi-command handler only when a
 * command stack exists. On a viewer the module loads inert; on a modeler it
 * behaves exactly as before.
 */
import { forEach } from "min-dash";

import MultiCommandHandler from "./MultiCommandHandler";

const HANDLERS: Record<string, any> = {
    "properties-panel.multi-command-executor": MultiCommandHandler,
};

function CommandInitializer(this: any, eventBus: any, injector: any): void {
    const commandStack = injector.get("commandStack", false);

    if (!commandStack) {
        return;
    }

    eventBus.on("diagram.init", function () {
        forEach(HANDLERS, function (handler: any, id: string) {
            commandStack.registerHandler(id, handler);
        });
    });
}

(CommandInitializer as any).$inject = ["eventBus", "injector"];

export default {
    __init__: [CommandInitializer],
};
