/**
 * The slice of the `vscode` module the window adapters touch, for
 * `vi.mock("vscode", () => import(".../vscodeWindowFake"))`. It keeps what the
 * user would see: status bar items, toasts, input boxes, quick picks, log
 * lines, progress indicators, and the commands registered and run. Call
 * {@link resetVscodeWindow} before each test.
 */

export { Uri } from "./vscodeFileSystemFake";

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export enum ProgressLocation {
    Window = 10,
}

export class ThemeColor {
    constructor(readonly id: string) {}
}

export enum ColorThemeKind {
    Light = 1,
    Dark = 2,
    HighContrast = 3,
    HighContrastLight = 4,
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

export type ToastSeverity = "information" | "warning" | "error";

/** A button as `show*Message` takes it: a label or a `MessageItem`. */
export type ToastAction = string | { readonly title: string };

/** Answers with the clicked action itself, as VS Code returns a `MessageItem` by identity. */
export class FakeToast {
    private answer: (action: ToastAction | undefined) => void = () => undefined;

    readonly choice = new Promise<ToastAction | undefined>((resolve) => (this.answer = resolve));

    constructor(
        readonly severity: ToastSeverity,
        readonly message: string,
        readonly actions: readonly ToastAction[],
    ) {}

    get labels(): string[] {
        return this.actions.map((action) => (typeof action === "string" ? action : action.title));
    }

    /** Clicks the first button with this label. */
    click(label: string): void {
        const index = this.labels.indexOf(label);
        if (index === -1) {
            throw new Error(`The toast offers no "${label}" action.`);
        }
        this.answer(this.actions[index]);
    }

    clickAt(index: number): void {
        if (index < 0 || index >= this.actions.length) {
            throw new Error(`The toast offers no action at ${index}.`);
        }
        this.answer(this.actions[index]);
    }

    close(): void {
        this.answer(undefined);
    }
}

export interface InputBoxOptions {
    readonly title?: string;
    readonly prompt?: string;
    readonly placeHolder?: string;
    readonly value?: string;
    readonly password?: boolean;
    readonly ignoreFocusOut?: boolean;
    readonly validateInput?: (value: string) => string | undefined | null;
}

/** An open input box: VS Code accepts no value its `validateInput` flags. */
export class FakeInputBox {
    private answer: (value: string | undefined) => void = () => undefined;

    readonly answered = new Promise<string | undefined>((resolve) => (this.answer = resolve));

    constructor(readonly options: InputBoxOptions) {}

    /** The validation message the box shows under `value`. */
    message(value = this.options.value ?? ""): string | undefined {
        return this.options.validateInput?.(value) ?? undefined;
    }

    accept(value: string): void {
        const message = this.message(value);
        if (message) {
            throw new Error(`The input box does not accept "${value}": ${message}`);
        }
        this.answer(value);
    }

    dismiss(): void {
        this.answer(undefined);
    }
}

export interface QuickPickItem {
    readonly label: string;
    readonly description?: string;
}

export interface QuickPickOptions {
    readonly title?: string;
    readonly placeHolder?: string;
    readonly canPickMany?: boolean;
    readonly matchOnDescription?: boolean;
}

export class FakeQuickPick {
    private answer: (picked: unknown) => void = () => undefined;

    readonly answered = new Promise<unknown>((resolve) => (this.answer = resolve));

    constructor(
        readonly items: readonly QuickPickItem[],
        readonly options: QuickPickOptions,
    ) {}

    pick(...labels: string[]): void {
        const picked = labels.map((label) => {
            const item = this.items.find((offered) => offered.label === label);
            if (!item) throw new Error(`The quick pick offers no "${label}".`);
            return item;
        });
        this.answer(this.options.canPickMany ? picked : picked[0]);
    }

    dismiss(): void {
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
const inputBoxes: FakeInputBox[] = [];
const quickPicks: FakeQuickPick[] = [];
const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
// One object, so a fake that spreads `window` reads the same theme.
const activeColorTheme: { kind: ColorThemeKind } = { kind: ColorThemeKind.Light };
const colorThemeListeners = new Set<(theme: { kind: ColorThemeKind }) => void>();

/** Plays the user switching VS Code's colour theme. */
export function changeColorTheme(kind: ColorThemeKind): void {
    activeColorTheme.kind = kind;
    colorThemeListeners.forEach((listener) => listener({ kind }));
}

export const vscodeWindow = {
    statusBarItems: statusBarItems as readonly FakeStatusBarItem[],
    toasts: toasts as readonly FakeToast[],
    outputChannels: outputChannels as readonly FakeLogOutputChannel[],
    progressIndicators: progressIndicators as readonly ProgressIndicator[],
    executedCommands: executedCommands as readonly ExecutedCommand[],
    inputBoxes: inputBoxes as readonly FakeInputBox[],
    quickPicks: quickPicks as readonly FakeQuickPick[],
    registeredCommands: registeredCommands as ReadonlyMap<string, (...args: unknown[]) => unknown>,
};

export function resetVscodeWindow(): void {
    statusBarItems.length = 0;
    toasts.length = 0;
    outputChannels.length = 0;
    progressIndicators.length = 0;
    executedCommands.length = 0;
    inputBoxes.length = 0;
    quickPicks.length = 0;
    registeredCommands.clear();
    activeColorTheme.kind = ColorThemeKind.Light;
    colorThemeListeners.clear();
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
    return toasts.map(({ severity, message, labels }) => ({
        severity,
        message,
        actions: labels,
    }));
}

function showMessage(
    severity: ToastSeverity,
    message: string,
    actions: ToastAction[],
): Promise<ToastAction | undefined> {
    const toast = new FakeToast(severity, message, actions);
    toasts.push(toast);
    return toast.choice;
}

export const window = {
    activeColorTheme: activeColorTheme as { readonly kind: ColorThemeKind },
    onDidChangeActiveColorTheme(listener: (theme: { kind: ColorThemeKind }) => void): {
        dispose(): void;
    } {
        colorThemeListeners.add(listener);
        return { dispose: () => colorThemeListeners.delete(listener) };
    },
    createStatusBarItem(alignment = StatusBarAlignment.Left, priority = 0): FakeStatusBarItem {
        const item = new FakeStatusBarItem(alignment, priority);
        statusBarItems.push(item);
        return item;
    },
    showInformationMessage: (message: string, ...actions: ToastAction[]) =>
        showMessage("information", message, actions),
    showWarningMessage: (message: string, ...actions: ToastAction[]) =>
        showMessage("warning", message, actions),
    showErrorMessage: (message: string, ...actions: ToastAction[]) =>
        showMessage("error", message, actions),
    showInputBox(options: InputBoxOptions): Promise<string | undefined> {
        const box = new FakeInputBox(options);
        inputBoxes.push(box);
        return box.answered;
    },
    showQuickPick(
        items: readonly QuickPickItem[],
        options: QuickPickOptions = {},
    ): Promise<unknown> {
        const pick = new FakeQuickPick(items, options);
        quickPicks.push(pick);
        return pick.answered;
    },
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
    registerCommand(
        command: string,
        handler: (...args: unknown[]) => unknown,
    ): { dispose(): void } {
        registeredCommands.set(command, handler);
        return { dispose: () => registeredCommands.delete(command) };
    },
};
