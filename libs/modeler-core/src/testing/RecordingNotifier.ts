import {
    errorLogText,
    notifiedErrorLogText,
    notifiedErrorToastText,
} from "../kernel/domain/errorLogText";
import { NotifierPort } from "../kernel/domain/hostPorts";

export type LogLevel = "debug" | "info" | "warning" | "error";

export interface LogEntry {
    readonly level: LogLevel;
    readonly message: string;
}

export class RecordingNotifier implements NotifierPort {
    readonly infos: string[] = [];
    readonly warnings: string[] = [];
    readonly errors: string[] = [];
    readonly logs: LogEntry[] = [];
    readonly loggedErrors: Error[] = [];
    readonly openedDocuments: string[] = [];
    readonly progressTitles: string[] = [];
    loggingConsoleOpened = false;

    logged(level: LogLevel): string[] {
        return this.logs.filter((entry) => entry.level === level).map((entry) => entry.message);
    }

    logDebug(message: string): void {
        this.logs.push({ level: "debug", message });
    }

    logInfo(message: string): void {
        this.logs.push({ level: "info", message });
    }

    logWarning(message: string): void {
        this.logs.push({ level: "warning", message });
    }

    logError(error: string | Error): void {
        if (error instanceof Error) this.loggedErrors.push(error);
        this.logs.push({ level: "error", message: errorLogText(error) });
    }

    showInfo(message: string): void {
        this.infos.push(message);
    }

    showWarning(message: string): void {
        this.warnings.push(message);
    }

    showError(message: string): void {
        this.errors.push(message);
    }

    notifyError(context: string, error: Error): void {
        this.loggedErrors.push(error);
        this.logs.push({ level: "error", message: notifiedErrorLogText(context, error) });
        this.showError(notifiedErrorToastText(context, error));
    }

    openLoggingConsole(): void {
        this.loggingConsoleOpened = true;
    }

    withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
        this.progressTitles.push(title);
        return task();
    }

    async openDocument(absolutePath: string): Promise<void> {
        this.openedDocuments.push(absolutePath);
    }

    /** Everything shown or logged. */
    transcript(): string {
        return [
            ...this.infos,
            ...this.warnings,
            ...this.errors,
            ...this.progressTitles,
            ...this.logs.map((entry) => entry.message),
        ].join("\n");
    }
}
