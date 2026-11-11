/**
 * bpmn-js DI module that generates element IDs from element names: a review
 * panel for the whole diagram (`elementIdReview.open()`), "Generate from name"
 * under the properties panel's ID field, and IDs that follow their names when
 * `elementIds.configure({ followName: true })` is set.
 */
import "./elementIds.css";

import { ElementIdReview } from "./ElementIdReview";
import { ElementIdsService } from "./ElementIdsService";
import { FollowNameBehavior } from "./FollowNameBehavior";
import { IdFromNamePropertiesProvider } from "./IdFromNamePropertiesProvider";
import {
    RENAME_ELEMENT_IDS_COMMAND,
    RenameElementIdsHandler,
    UPDATE_LABEL_ID_COMMAND,
    UpdateLabelIdHandler,
} from "./RenameElementIdsHandler";

export type { ElementIdReview } from "./ElementIdReview";
export type { ElementIdProposal, ElementIdsService } from "./ElementIdsService";

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
    elementIdReview: ["type", ElementIdReview],
    followNameBehavior: ["type", FollowNameBehavior],
    idFromNamePropertiesProvider: ["type", IdFromNamePropertiesProvider],
};
