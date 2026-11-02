import { describe, expectTypeOf, it } from "vitest";

import type {
    Command,
    DeployCommand,
    DiffReadyCommand,
    HostApi,
    Query,
    RequestFocusCommand,
    SyncDocumentCommand,
    SyncViewportQuery,
    TakeFocusQuery,
} from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../webviewState";
import type { DiffPaneChannel, HostChannel } from "./hostChannel";

type PostedMessage = Parameters<HostChannel["postMessage"]>[0];

type PostedByDiffPane = Parameters<DiffPaneChannel["postMessage"]>[0];

type AnyMessageChannel = Pick<HostApi<WebviewState, Command | Query>, "postMessage">;

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

    it("cannot be handed to a helper that posts any message", () => {
        expectTypeOf<HostChannel>().not.toExtend<AnyMessageChannel>();
    });
});

describe("DiffPaneChannel", () => {
    it("posts the diff pane's commands", () => {
        expectTypeOf<DiffReadyCommand>().toExtend<PostedByDiffPane>();
    });

    it("rejects a command of the BPMN editor", () => {
        expectTypeOf<SyncDocumentCommand>().not.toExtend<PostedByDiffPane>();
        expectTypeOf<RequestFocusCommand>().not.toExtend<PostedByDiffPane>();
    });

    it("rejects a query, which only the host sends", () => {
        expectTypeOf<SyncViewportQuery>().not.toExtend<PostedByDiffPane>();
    });

    it("cannot be handed to a helper that posts any message", () => {
        expectTypeOf<DiffPaneChannel>().not.toExtend<AnyMessageChannel>();
    });
});
