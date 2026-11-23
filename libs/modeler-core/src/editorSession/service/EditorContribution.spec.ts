import { describe, expectTypeOf, it } from "vitest";

import {
    NavigateToImplementationCommand,
    SyncActivitiesCommand,
} from "@miragon/bpmn-modeler-shared";

import { CommandHandlers } from "./EditorContribution";
import { MessageHandler } from "./WebviewMessageRouter";

describe("an editor contribution's command handlers", () => {
    it("keys a handler by each command it serves, and hands the handler that command", () => {
        type Handlers = CommandHandlers<NavigateToImplementationCommand | SyncActivitiesCommand>;

        expectTypeOf<keyof Handlers>().toEqualTypeOf<
            "NavigateToImplementationCommand" | "SyncActivitiesCommand"
        >();
        expectTypeOf<Handlers["SyncActivitiesCommand"]>().toEqualTypeOf<
            MessageHandler<SyncActivitiesCommand>
        >();
    });
});
