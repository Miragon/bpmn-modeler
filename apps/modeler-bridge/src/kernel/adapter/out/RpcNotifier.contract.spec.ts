import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describeNotifierContract } from "@miragon/bpmn-modeler-core/testing";
import { describe, expect, it } from "vitest";

import { METHODS } from "../../../protocol/domain/descriptor";
import { NotifierProgressParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcNotifier } from "./RpcNotifier";

interface CoreFrame {
    readonly method: string;
    readonly params: Partial<NotifierProgressParams>;
}

interface ProgressCase {
    readonly name: string;
    readonly frames: readonly CoreFrame[];
    readonly spinners: readonly string[];
}

const PROGRESS_CASES = (
    JSON.parse(
        readFileSync(resolve(__dirname, "../../../__fixtures__/intellijProgress.cases.json"), "utf8"),
    ) as { cases: ProgressCase[] }
).cases;

/**
 * Answers `notifier/progressStart` and `notifier/progressEnd` as IntelliJ's
 * `HostUiRouter` does: it keeps one spinner per title (an empty one when the
 * frame has none). A start replaces the spinner of its title, ending the one
 * that ran, and an end removes its title's spinner. `HostUiRouterTest` runs
 * `intellijProgress.cases.json`, which this host answers too. What the spinner
 * looks like and its cleanup when the bridge dies are not in those rows.
 */
class IntellijProgressHost {
    private readonly spinnerTitles = new Set<string>();

    connect(): RpcNotifier {
        return new RpcNotifier(new Rpc((line) => this.receive(JSON.parse(line) as CoreFrame)));
    }

    showingProgress(): readonly string[] {
        return [...this.spinnerTitles];
    }

    receive(frame: CoreFrame): void {
        const title = frame.params.title ?? "";
        switch (frame.method) {
            case METHODS.notifierProgressStart:
                this.spinnerTitles.add(title);
                return;
            case METHODS.notifierProgressEnd:
                this.spinnerTitles.delete(title);
                return;
            default:
                throw new Error(`The loopback host does not answer ${frame.method}`);
        }
    }
}

describeNotifierContract("RpcNotifier against a loopback IntelliJ host", async () => {
    const host = new IntellijProgressHost();
    return { notifier: host.connect(), showingProgress: () => host.showingProgress() };
});

describe("the loopback IntelliJ host answers the rows HostUiRouterTest runs", () => {
    it.each(PROGRESS_CASES)("$name", ({ frames, spinners }) => {
        const host = new IntellijProgressHost();

        frames.forEach((frame) => host.receive(frame));

        expect(host.showingProgress()).toEqual(spinners);
    });
});
