import { describe, expect, it } from "vitest";

import { ElementIdsModule } from "./index";
import { RENAME_ELEMENT_IDS_COMMAND, UPDATE_LABEL_ID_COMMAND } from "./RenameElementIdsHandler";

type Initializer = (
    eventBus: { on(event: string, listener: () => void): void },
    injector: unknown,
) => void;

const initializer = ElementIdsModule.elementIdCommands[1] as unknown as Initializer;

describe("ElementIdsModule", () => {
    it("registers the rename commands once the diagram is up", () => {
        const registered: string[] = [];
        let init: (() => void) | undefined;
        initializer(
            { on: (_, listener) => (init = listener) },
            { get: () => ({ registerHandler: (command: string) => registered.push(command) }) },
        );

        expect(registered).toEqual([]);
        init?.();

        expect(registered).toEqual([RENAME_ELEMENT_IDS_COMMAND, UPDATE_LABEL_ID_COMMAND]);
    });

    it("stays inert on a surface without a command stack", () => {
        const events: string[] = [];

        initializer({ on: (event) => events.push(event) }, { get: () => null });

        expect(events).toEqual([]);
    });
});
