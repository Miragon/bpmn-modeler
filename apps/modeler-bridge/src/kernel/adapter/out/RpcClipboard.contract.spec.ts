import { describeClipboardContract } from "@miragon/bpmn-modeler-core/testing";

import { METHODS } from "../../../protocol/domain/descriptor";
import { ClipboardReadResult, ClipboardWriteParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcClipboard } from "./RpcClipboard";

interface CoreFrame {
    readonly method: string;
    readonly params: Partial<ClipboardWriteParams>;
    readonly id?: number;
}

/**
 * Answers `clipboard/read` and `clipboard/write` as IntelliJ's `HostUiRouter`
 * does: both run on the event dispatch thread in the order they arrive, a
 * write puts its text (empty when it has none) on the clipboard, and a read
 * replies with the clipboard's text, empty when it holds none. A string stands
 * in for `CopyPasteManager`; what the system clipboard does with it is not
 * pinned (engineering-practices ADR).
 */
class IntellijClipboardHost {
    private clipboardText: string | undefined;
    private eventDispatchThread: Promise<void> = Promise.resolve();

    connect(): RpcClipboard {
        const rpc: Rpc = new Rpc((line) => this.receive(rpc, JSON.parse(line) as CoreFrame));
        return new RpcClipboard(rpc);
    }

    copyElsewhere(text: string): Promise<void> {
        return this.onEventDispatchThread(() => {
            this.clipboardText = text;
        });
    }

    async pasteElsewhere(): Promise<string> {
        await this.onEventDispatchThread(() => undefined);
        return this.clipboardText ?? "";
    }

    private receive(rpc: Rpc, frame: CoreFrame): void {
        switch (frame.method) {
            case METHODS.clipboardWrite: {
                const text = frame.params.text ?? "";
                void this.onEventDispatchThread(() => {
                    this.clipboardText = text;
                });
                return;
            }
            case METHODS.clipboardRead:
                void this.onEventDispatchThread(() => {
                    const result: ClipboardReadResult = { text: this.clipboardText ?? "" };
                    void rpc.handleLine(JSON.stringify({ id: frame.id, result }));
                });
                return;
            default:
                throw new Error(`The loopback host does not answer ${frame.method}`);
        }
    }

    private onEventDispatchThread(work: () => void): Promise<void> {
        this.eventDispatchThread = this.eventDispatchThread.then(
            () =>
                new Promise<void>((resolve) =>
                    setTimeout(() => {
                        work();
                        resolve();
                    }),
                ),
        );
        return this.eventDispatchThread;
    }
}

describeClipboardContract("RpcClipboard against a loopback IntelliJ host", async () => {
    const host = new IntellijClipboardHost();
    return {
        clipboard: host.connect(),
        copyElsewhere: (text) => host.copyElsewhere(text),
        pasteElsewhere: () => host.pasteElsewhere(),
    };
});
