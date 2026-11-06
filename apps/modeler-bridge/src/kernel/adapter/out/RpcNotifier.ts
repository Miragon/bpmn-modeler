import { errorLogText, notifiedErrorLogText, notifiedErrorToastText, NotifierPort } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";

/**
 * Forwards every {@link NotifierPort} call to the host so it can surface real
 * IntelliJ UI — `Notifications.Bus` balloons for the user-facing methods and an
 * IDE log/console for the diagnostic ones. The core picks the method and writes
 * its text; the host only renders it.
 */
export class RpcNotifier implements NotifierPort {
    private readonly runningProgressByTitle = new Map<string, number>();

    constructor(private readonly rpc: Rpc) {}

    showInfo(message: string): void {
        this.rpc.notify(METHODS.notifierShowInfo, { message });
    }

    showWarning(message: string): void {
        this.rpc.notify(METHODS.notifierShowWarning, { message });
    }

    showError(message: string): void {
        this.rpc.notify(METHODS.notifierShowError, { message });
    }

    notifyError(context: string, error: Error): void {
        this.rpc.notify(METHODS.notifierLog, {
            level: "error",
            message: notifiedErrorLogText(context, error),
        });
        this.showError(notifiedErrorToastText(context, error));
    }

    openLoggingConsole(): void {
        this.rpc.notify(METHODS.notifierOpenConsole, {});
    }

    logDebug(message: string): void {
        this.rpc.notify(METHODS.notifierLog, { level: "debug", message });
    }

    logInfo(message: string): void {
        this.rpc.notify(METHODS.notifierLog, { level: "info", message });
    }

    logWarning(message: string): void {
        this.rpc.notify(METHODS.notifierLog, { level: "warn", message });
    }

    logError(error: string | Error): void {
        this.rpc.notify(METHODS.notifierLog, { level: "error", message: errorLogText(error) });
    }

    /**
     * The progress task runs core-side (that is where the work is); the host
     * only renders a spinner, so we bracket the local run with start/end
     * notifications and `finally` guarantees the spinner clears even on throw.
     * The host keeps one spinner per title, so overlapping runs of a title
     * share one bracket: the first run starts it and the last one ends it.
     */
    async withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
        this.startProgressRun(title);
        try {
            return await task();
        } finally {
            this.endProgressRun(title);
        }
    }

    private startProgressRun(title: string): void {
        const running = this.runningProgressByTitle.get(title) ?? 0;
        this.runningProgressByTitle.set(title, running + 1);
        if (running === 0) this.rpc.notify(METHODS.notifierProgressStart, { title });
    }

    private endProgressRun(title: string): void {
        const stillRunning = (this.runningProgressByTitle.get(title) ?? 1) - 1;
        if (stillRunning > 0) {
            this.runningProgressByTitle.set(title, stillRunning);
            return;
        }
        this.runningProgressByTitle.delete(title);
        this.rpc.notify(METHODS.notifierProgressEnd, { title });
    }

    async openDocument(absolutePath: string): Promise<void> {
        this.rpc.notify(METHODS.notifierOpenDocument, { path: absolutePath });
    }
}
