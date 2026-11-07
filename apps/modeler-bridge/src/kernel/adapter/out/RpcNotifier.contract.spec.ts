import { describeNotifierContract } from "@miragon/bpmn-modeler-core/testing";

import { METHODS } from "../../../protocol/domain/descriptor";
import { NotifierProgressParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcNotifier } from "./RpcNotifier";

interface CoreFrame {
    readonly method: string;
    readonly params: Partial<NotifierProgressParams>;
}

/**
 * Answers `notifier/progressStart` and `notifier/progressEnd` as IntelliJ's
 * `HostUiRouter` does: it keeps one spinner per title (an empty one when the
 * frame has none). A start replaces the spinner of its title, ending the one
 * that ran, and an end removes its title's spinner. What the spinner looks like
 * and its cleanup when the bridge dies are the Kotlin half.
 */
class IntellijProgressHost {
    private readonly spinnerTitles = new Set<string>();

    connect(): RpcNotifier {
        return new RpcNotifier(new Rpc((line) => this.receive(JSON.parse(line) as CoreFrame)));
    }

    showingProgress(): readonly string[] {
        return [...this.spinnerTitles];
    }

    private receive(frame: CoreFrame): void {
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
