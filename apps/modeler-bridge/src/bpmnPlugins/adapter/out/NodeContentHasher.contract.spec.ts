import { describeContentHasherContract } from "@miragon/bpmn-modeler-core/testing";

import { NodeContentHasher } from "./NodeContentHasher";

describeContentHasherContract("The bridge's NodeContentHasher", () => new NodeContentHasher());
