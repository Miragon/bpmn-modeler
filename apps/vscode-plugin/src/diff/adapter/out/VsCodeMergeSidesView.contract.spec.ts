import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeGitFake"));

import { ExtensionContext } from "vscode";

import { describeMergeSidesViewContract } from "@miragon/bpmn-modeler-core/testing";

import {
    commandCalls,
    providedContent,
    resetVscodeGit,
    Uri,
} from "../../../__fixtures__/vscodeGitFake";
import { VsCodeMergeSidesView } from "./VsCodeMergeSidesView";

const registeredView = () => {
    const view = new VsCodeMergeSidesView();
    view.register({ subscriptions: [] } as unknown as ExtensionContext);
    return view;
};

beforeEach(() => resetVscodeGit());

describeMergeSidesViewContract("VsCodeMergeSidesView", () => ({
    view: registeredView(),
    // The provider of the view registered last serves the scheme, as after a restart.
    servedText: (uri) => providedContent(uri) || undefined,
}));

describe("VsCodeMergeSidesView", () => {
    const SIDES = {
        current: { text: "<current/>", basename: "order.current.bpmn" },
        incoming: { text: "<incoming/>", basename: "order.incoming.bpmn" },
    };

    it("serves each side under the bpmn-merge scheme with its side and opening in the query", () => {
        const uris = registeredView().serve("file:///repo/order.bpmn", SIDES);

        const current = Uri.parse(uris.current);
        expect(current.scheme).toBe("bpmn-merge");
        expect(current.query).toMatch(/^side=current&opening=[0-9a-f-]{36}$/);
        expect(Uri.parse(uris.incoming).query).toMatch(/^side=incoming&opening=/);
    });

    it("opens current on the left and incoming on the right as one diff", async () => {
        const view = registeredView();
        const uris = view.serve("file:///repo/order.bpmn", SIDES);

        await view.open(uris, "order.bpmn (Merge: main ↔ feature)");

        expect(commandCalls).toHaveLength(1);
        const [command, left, right, title, options] = commandCalls[0];
        expect([command, String(left), String(right), title, options]).toStrictEqual([
            "vscode.diff",
            uris.current,
            uris.incoming,
            "order.bpmn (Merge: main ↔ feature)",
            { preview: false },
        ]);
    });

    it("serves an empty text for a side it no longer serves, so a restored pane still resolves", () => {
        const view = registeredView();
        const uris = view.serve("file:///repo/order.bpmn", SIDES);

        view.release(uris);

        expect(providedContent(uris.current)).toBe("");
    });
});
