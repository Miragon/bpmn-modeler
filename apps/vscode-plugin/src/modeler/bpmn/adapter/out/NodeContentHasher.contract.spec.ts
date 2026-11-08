import { describeContentHasherContract } from "@miragon/bpmn-modeler-core/testing";

import { NodeContentHasher } from "./NodeContentHasher";

describeContentHasherContract("VS Code's NodeContentHasher", () => new NodeContentHasher());
