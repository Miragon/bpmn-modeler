import BpmnModeler7 from "camunda-bpmn-js/lib/camunda-platform/Modeler";
import { CreateAppendElementTemplatesModule } from "bpmn-js-create-append-anything";
import { CreateAppendC7ElementTemplatesModule } from "@miragon/create-append-c7";
// The CJS entry wraps the ESM module in a default export, preventing DI registration under Vite.
import TransactionBoundariesModule from "camunda-transaction-boundaries/lib/index.js";
import type { EngineStack } from "./engineStack";

export const c7Stack: EngineStack = {
    Modeler: BpmnModeler7,
    engineModules: [
        CreateAppendElementTemplatesModule,
        CreateAppendC7ElementTemplatesModule,
        TransactionBoundariesModule,
    ],
};
