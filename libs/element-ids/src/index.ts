/**
 * bpmn-js DI module that generates element IDs from element names: the rows of
 * a review for a host to show in its own panel (`elementIds.list()`) and their
 * rename (`elementIds.rename()`), "Generate from name" under the properties
 * panel's ID field, and IDs that follow their names when
 * `elementIds.configure({ followName: true })` is set. IDs follow the lint rule
 * `@miragon/rules/element-id-naming` through the convention the lint stack hands
 * in with `elementIds.configure({ convention })`.
 */
import "./elementIds.css";

import { ElementIdsService } from "./ElementIdsService";
import { FollowNameBehavior } from "./FollowNameBehavior";
import { IdFromNamePropertiesProvider } from "./IdFromNamePropertiesProvider";
import {
    RENAME_ELEMENT_IDS_COMMAND,
    RenameElementIdsHandler,
    UPDATE_LABEL_ID_COMMAND,
    UpdateLabelIdHandler,
} from "./RenameElementIdsHandler";

export type { IdConvention } from "./convention";
export type { ElementIdOptions, ElementIdProposal, ElementIdsService } from "./ElementIdsService";

interface EventBusLike {
    on(event: string, listener: () => void): void;
}

interface InjectorLike {
    get<T>(name: string, strict: false): T | null;
}

interface CommandStackLike {
    registerHandler(command: string, handler: unknown): void;
}

/** Registers the rename commands once the diagram is up; inert on a surface without a command stack. */
function ElementIdCommands(eventBus: EventBusLike, injector: InjectorLike): void {
    const commandStack = injector.get<CommandStackLike>("commandStack", false);
    if (!commandStack) return;

    eventBus.on("diagram.init", () => {
        commandStack.registerHandler(RENAME_ELEMENT_IDS_COMMAND, RenameElementIdsHandler);
        commandStack.registerHandler(UPDATE_LABEL_ID_COMMAND, UpdateLabelIdHandler);
    });
}

(ElementIdCommands as unknown as { $inject: string[] }).$inject = ["eventBus", "injector"];

export const ElementIdsModule = {
    __init__: ["elementIdCommands", "followNameBehavior", "idFromNamePropertiesProvider"],
    elementIdCommands: ["type", ElementIdCommands],
    elementIds: ["type", ElementIdsService],
    followNameBehavior: ["type", FollowNameBehavior],
    idFromNamePropertiesProvider: ["type", IdFromNamePropertiesProvider],
};
