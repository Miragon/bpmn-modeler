import { describe, expectTypeOf, it } from "vitest";

import type {
    DeployCommand,
    DiffReadyCommand,
    RequestFocusCommand,
    TakeFocusQuery,
} from "@miragon/bpmn-modeler-shared";

import type { HostChannel } from "./hostChannel";

type PostedMessage = Parameters<HostChannel["postMessage"]>[0];

// Type-level spec: the `typecheck` script fails when an expectation breaks.
describe("HostChannel", () => {
    it("posts the BPMN editor's commands", () => {
        expectTypeOf<RequestFocusCommand>().toExtend<PostedMessage>();
    });

    it("rejects a command another surface posts", () => {
        expectTypeOf<DeployCommand>().not.toExtend<PostedMessage>();
        expectTypeOf<DiffReadyCommand>().not.toExtend<PostedMessage>();
    });

    it("rejects a query, which only the host sends", () => {
        expectTypeOf<TakeFocusQuery>().not.toExtend<PostedMessage>();
    });
});
