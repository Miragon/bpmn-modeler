import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    describeElementXmlDiffViewContract,
    ELEMENT_XML_DIFF_CONTRACT_PANES,
    ShownElementXmlDiff,
} from "@miragon/bpmn-modeler-core/testing";
import { describe, expect, it } from "vitest";

import { METHODS } from "../../../protocol/domain/descriptor";
import { ElementXmlDiffCloseParams, ElementXmlDiffShowParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcElementXmlDiffView } from "./RpcElementXmlDiffView";

interface CoreFrame {
    readonly method: string;
    readonly params: ElementXmlDiffShowParams | ElementXmlDiffCloseParams;
}

type Step = { readonly frame: CoreFrame } | { readonly userCloses: string };

interface ElementXmlDiffCase {
    readonly name: string;
    readonly steps: readonly Step[];
    readonly shown: Readonly<Record<string, ShownElementXmlDiff | null>>;
    readonly closedByUser: readonly string[];
}

const CASE_FILE = JSON.parse(
    readFileSync(resolve(__dirname, "../../../__fixtures__/intellijElementXmlDiff.cases.json"), "utf8"),
) as { diagramDiffs: Record<string, readonly string[]>; cases: ElementXmlDiffCase[] };

/**
 * Answers `elementXmlDiff/*` as IntelliJ's `DiffRouter` and
 * `ElementXmlDiffSlot` do: each diagram diff, found by a pane of it, shows at
 * most one XML diff under the core's key. A refresh replaces only what that
 * key shows, a close hides it only while it shows that key, and the user's
 * close reports the key it showed. `DiffRouterElementXmlDiffTest` runs
 * `intellijElementXmlDiff.cases.json`, which this host answers too.
 */
class IntellijElementXmlDiffHost {
    private readonly diffIdByPane = new Map<string, string>();
    private readonly shownByDiff = new Map<string, { diffKey: string; shown: ShownElementXmlDiff }>();

    constructor(private readonly onClosedByUser: (diffKey: string) => void) {}

    openDiagramDiff(diffId: string, paneUris: readonly string[]): void {
        paneUris.forEach((paneUri) => this.diffIdByPane.set(paneUri, diffId));
    }

    connect(): RpcElementXmlDiffView {
        return new RpcElementXmlDiffView(new Rpc((line) => this.receive(JSON.parse(line) as CoreFrame)));
    }

    receive({ method, params }: CoreFrame): void {
        switch (method) {
            case METHODS.elementXmlDiffClose:
                for (const [diffId, open] of this.shownByDiff) {
                    if (open.diffKey === params.diffKey) this.shownByDiff.delete(diffId);
                }
                return;
            case METHODS.elementXmlDiffShow:
            case METHODS.elementXmlDiffRefresh:
                this.showIn(method === METHODS.elementXmlDiffShow, params as ElementXmlDiffShowParams);
                return;
            default:
                throw new Error(`The loopback host does not answer ${method}`);
        }
    }

    private showIn(opens: boolean, { diffKey, paneUri, title, before, after }: ElementXmlDiffShowParams): void {
        const diffId = this.diffIdByPane.get(paneUri);
        if (diffId === undefined) return;
        if (opens || this.shownByDiff.get(diffId)?.diffKey === diffKey) {
            this.shownByDiff.set(diffId, { diffKey, shown: { title, before, after } });
        }
    }

    closeByUser(diffId: string): void {
        const open = this.shownByDiff.get(diffId);
        if (!open) return;
        this.shownByDiff.delete(diffId);
        this.onClosedByUser(open.diffKey);
    }

    shownIn(diffId: string): ShownElementXmlDiff | null {
        return this.shownByDiff.get(diffId)?.shown ?? null;
    }

    allShown(): ShownElementXmlDiff[] {
        return [...this.shownByDiff.values()].map(({ shown }) => shown);
    }
}

describeElementXmlDiffViewContract("RpcElementXmlDiffView against a loopback IntelliJ host", (onClosedByUser) => {
    const host = new IntellijElementXmlDiffHost(onClosedByUser);
    for (const [diffKey, paneUri] of Object.entries(ELEMENT_XML_DIFF_CONTRACT_PANES)) {
        host.openDiagramDiff(diffKey, [paneUri]);
    }
    return {
        view: host.connect(),
        shown: () => host.allShown(),
        closeByUser: (diff) => host.closeByUser(diff.diffKey),
    };
});

describe("the loopback IntelliJ host answers the rows DiffRouterElementXmlDiffTest runs", () => {
    it.each(CASE_FILE.cases)("$name", ({ steps, shown, closedByUser }) => {
        const reported: string[] = [];
        const host = new IntellijElementXmlDiffHost((diffKey) => reported.push(diffKey));
        for (const [diffId, paneUris] of Object.entries(CASE_FILE.diagramDiffs)) {
            host.openDiagramDiff(diffId, paneUris);
        }

        for (const step of steps) {
            if ("frame" in step) host.receive(step.frame);
            else host.closeByUser(step.userCloses);
        }

        const shownByDiff = Object.fromEntries(
            Object.keys(CASE_FILE.diagramDiffs).map((diffId) => [diffId, host.shownIn(diffId)]),
        );
        expect(shownByDiff).toStrictEqual(shown);
        expect(reported).toStrictEqual(closedByUser);
    });
});
