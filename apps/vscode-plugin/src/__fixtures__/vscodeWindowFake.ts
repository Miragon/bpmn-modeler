/**
 * The slice of the `vscode` module the window adapters touch, for
 * `vi.mock("vscode", () => import(".../vscodeWindowFake"))`. It keeps what the
 * user would see: status bar items, toasts, log lines, progress indicators and
 * the commands that ran. Call {@link resetVscodeWindow} before each test.
 */

export { Uri } from "./vscodeFileSystemFake";

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15,
}

export class ThemeColor {
    constructor(readonly id: string) {}
}

export class FakeStatusBarItem {
    text = "";
    tooltip: string | undefined;
    color: string | ThemeColor | undefined;
    backgroundColor: ThemeColor | undefined;
    command: string | undefined;
    visible = false;
    disposed = false;

    constructor(
        readonly id: string | undefined,
        readonly alignment: StatusBarAlignment,
        readonly priority: number,
    ) {}

    show(): void {
        if (!this.disposed) this.visible = true;
    }

    hide(): void {
        this.visible = false;
    }

    dispose(): void {
        this.visible = false;
        this.disposed = true;
    }
}

export interface StatusBarEntry {
    readonly side: "left" | "right";
    readonly text: string;
    readonly tooltip: string | undefined;
    readonly color: string | undefined;
    readonly background: string | undefined;
    readonly command: string | undefined;
}

export type ToastSeverity = "information" | "error";

export class FakeToast {
    private answer: (action: string | undefined) => void = () => undefined;

    readonly choice = new Promise<string | undefined>((resolve) => (this.answer = resolve));

    constructor(
        readonly severity: ToastSeverity,
        readonly message: string,
        readonly actions: readonly string[],
    ) {}

    click(action: string): void {
        if (!this.actions.includes(action)) {
            throw new Error(`The toast offers no "${action}" action.`);
        }
        this.answer(action);
    }

    close(): void {
        this.answer(undefined);
    }
}

export type LogLevel = "debug" | "info" | "warning" | "error";

export interface LogLine {
    readonly level: LogLevel;
    readonly entry: string | Error;
}

export class FakeLogOutputChannel {
    readonly lines: LogLine[] = [];
    revealed: { preserveFocus: boolean } | undefined;

    constructor(
        readonly name: string,
        readonly isLogChannel: boolean,
    ) {}

    debug(message: string): void {
        this.lines.push({ level: "debug", entry: message });
    }

    info(message: string): void {
        this.lines.push({ level: "info", entry: message });
    }

    warn(message: string): void {
        this.lines.push({ level: "warning", entry: message });
    }

    error(error: string | Error): void {
        this.lines.push({ level: "error", entry: error });
    }

    show(preserveFocus = false): void {
        this.revealed = { preserveFocus };
    }
}

export interface ProgressIndicator {
    readonly location: ProgressLocation;
    readonly title: string | undefined;
    running: boolean;
}

export interface ExecutedCommand {
    readonly command: string;
    readonly args: readonly unknown[];
}

const statusBarItems: FakeStatusBarItem[] = [];
const toasts: FakeToast[] = [];
const outputChannels: FakeLogOutputChannel[] = [];
const progressIndicators: ProgressIndicator[] = [];
const executedCommands: ExecutedCommand[] = [];

export const vscodeWindow = {
    statusBarItems: statusBarItems as readonly FakeStatusBarItem[],
    toasts: toasts as readonly FakeToast[],
    outputChannels: outputChannels as readonly FakeLogOutputChannel[],
    progressIndicators: progressIndicators as readonly ProgressIndicator[],
    executedCommands: executedCommands as readonly ExecutedCommand[],
};

export function resetVscodeWindow(): void {
    statusBarItems.length = 0;
    toasts.length = 0;
    outputChannels.length = 0;
    progressIndicators.length = 0;
    executedCommands.length = 0;
}

/** The visible items left to right, as VS Code lays them out: left side first, higher priority further left. */
export function renderedStatusBar(): StatusBarEntry[] {
    const sideOrder = (item: FakeStatusBarItem) =>
        item.alignment === StatusBarAlignment.Left ? 0 : 1;
    return statusBarItems
        .filter((item) => item.visible)
        .sort((left, right) => sideOrder(left) - sideOrder(right) || right.priority - left.priority)
        .map((item) => ({
            side: item.alignment === StatusBarAlignment.Left ? "left" : "right",
            text: item.text,
            tooltip: item.tooltip,
            color: item.color instanceof ThemeColor ? item.color.id : item.color,
            background: item.backgroundColor?.id,
            command: item.command,
        }));
}

export function renderedToasts(): {
    severity: ToastSeverity;
    message: string;
    actions: string[];
}[] {
    return toasts.map(({ severity, message, actions }) => ({
        severity,
        message,
        actions: [...actions],
    }));
}

function showMessage(
    severity: ToastSeverity,
    message: string,
    actions: string[],
): Promise<string | undefined> {
    const toast = new FakeToast(severity, message, actions);
    toasts.push(toast);
    return toast.choice;
}

// Both overloads, so an adapter that starts passing an item id keeps working here.
function createStatusBarItem(
    idOrAlignment?: string | StatusBarAlignment,
    alignmentOrPriority?: number,
    priority?: number,
): FakeStatusBarItem {
    const item =
        typeof idOrAlignment === "string"
            ? new FakeStatusBarItem(
                  idOrAlignment,
                  alignmentOrPriority ?? StatusBarAlignment.Left,
                  priority ?? 0,
              )
            : new FakeStatusBarItem(
                  undefined,
                  idOrAlignment ?? StatusBarAlignment.Left,
                  alignmentOrPriority ?? 0,
              );
    statusBarItems.push(item);
    return item;
}

export const window = {
    createStatusBarItem,
    showInformationMessage: (message: string, ...actions: string[]) =>
        showMessage("information", message, actions),
    showErrorMessage: (message: string, ...actions: string[]) =>
        showMessage("error", message, actions),
    createOutputChannel(name: string, options?: { log: true }): FakeLogOutputChannel {
        const channel = new FakeLogOutputChannel(name, options?.log === true);
        outputChannels.push(channel);
        return channel;
    },
    async withProgress<T>(
        options: { location: ProgressLocation; title?: string },
        task: () => Promise<T>,
    ): Promise<T> {
        const indicator: ProgressIndicator = {
            location: options.location,
            title: options.title,
            running: true,
        };
        progressIndicators.push(indicator);
        try {
            return await task();
        } finally {
            indicator.running = false;
        }
    },
};

export const commands = {
    async executeCommand(command: string, ...args: unknown[]): Promise<undefined> {
        executedCommands.push({ command, args });
        return undefined;
    },
};
