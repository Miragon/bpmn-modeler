import * as vscode from "vscode";

export class Logger {
    private static _logger: vscode.LogOutputChannel;

    private static _isOpen = false;

    public static get isOpen(): boolean {
        return this._isOpen;
    }

    public static get(): vscode.LogOutputChannel;

    public static get(channel: string): vscode.LogOutputChannel;

    public static get(channel?: string): vscode.LogOutputChannel {
        if (this._logger) {
            return this._logger;
        } else {
            if (channel) {
                return (this._logger = vscode.window.createOutputChannel(channel, {
                    log: true,
                }));
            } else {
                throw new Error("[bpmn.modeler.logger] Please set the output channel");
            }
        }
    }

    public static hide() {
        this._isOpen = false;
        this._logger.hide();
    }

    public static show() {
        this._isOpen = true;
        this._logger.show(true);
    }

    public static info(...args: string[]): void {
        if (!this._logger) {
            throw new Error("[bpmn.modeler.logger] Logger is not initialized!");
        }
        const message = args.join(" ");
        this._logger.info(message);
    }

    public static error(...args: string[]): void {
        if (!this._logger) {
            throw new Error("[bpmn.modeler.logger] Logger is not initialized!");
        }
        const message = args.join(" ");
        this._logger.error(message);
    }
}
