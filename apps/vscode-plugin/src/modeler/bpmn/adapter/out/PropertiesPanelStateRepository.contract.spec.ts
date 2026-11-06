import type { ExtensionContext } from "vscode";

import { describePropertiesPanelStateContract } from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento } from "../../../../__fixtures__/vscodeStorage";
import { PropertiesPanelStateRepository } from "./PropertiesPanelStateRepository";

describePropertiesPanelStateContract(
    "PropertiesPanelStateRepository over a fake globalState",
    async () => {
        const context = { globalState: new InMemoryMemento() } as unknown as ExtensionContext;
        return {
            panelState: new PropertiesPanelStateRepository(context),
            reopen: () => new PropertiesPanelStateRepository(context),
        };
    },
);
