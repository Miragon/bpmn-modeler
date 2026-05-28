import { posix } from "path";

import { env, Uri, window, workspace } from "vscode";

import { UserCancelledError } from "../domain/errors";
import { MigrationScope } from "../domain/MigrationPlan";
import { VsCodeWorkspace } from "./VsCodeWorkspace";
import { VsCodeLogger, VsCodeTextEditor } from "./window";

import { Engine } from "@miragon/bpmn-modeler-shared";
export class VsCodeUI {
    private readonly textEditor = new VsCodeTextEditor();

    private readonly logger = new VsCodeLogger("bpmn.modeler");

    constructor(private readonly vsWorkspace: VsCodeWorkspace) {}

    showInfo(message: string): void {
        window.showInformationMessage(message);
    }

    showError(message: string): void {
        window.showErrorMessage(message);
    }

    toggleTextEditor(documentPath: string): Promise<boolean> {
        return this.textEditor.toggle(documentPath);
    }

    async readClipboard(): Promise<string> {
        return env.clipboard.readText();
    }

    async writeClipboard(text: string): Promise<void> {
        await env.clipboard.writeText(text);
    }

    openLoggingConsole(): void {
        this.logger.open();
    }

    logInfo(message: string): void {
        this.logger.info(message);
    }

    logWarning(message: string): void {
        this.logger.warn(message);
    }

    logError(error: Error): void {
        this.logger.error(error);
    }

    /**
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     */
    async pickExecutionPlatform(placeHolder: string, items: string[]): Promise<Engine> {
        const result = await window.showQuickPick(items, {
            placeHolder,
            onDidSelectItem: (item) => item,
        });

        if (result === undefined) {
            throw new UserCancelledError();
        } else if (result === "Camunda 7") {
            return "c7";
        } else if (result === "Camunda 8") {
            return "c8";
        } else {
            throw new Error(`Unknown execution platform version: "${result}"`);
        }
    }

    /**
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     */
    async pickMigrationScope(c7Count: number, c8Count: number): Promise<MigrationScope> {
        const items = [
            `Camunda 7 only (${c7Count} diagram${c7Count !== 1 ? "s" : ""})`,
            `Camunda 8 only (${c8Count} diagram${c8Count !== 1 ? "s" : ""})`,
            `Both (${c7Count + c8Count} diagram${c7Count + c8Count !== 1 ? "s" : ""})`,
        ];

        const result = await window.showQuickPick(items, {
            placeHolder: "Which diagrams do you want to migrate?",
        });

        if (result === undefined) {
            throw new UserCancelledError();
        } else if (result.startsWith("Camunda 7")) {
            return "c7";
        } else if (result.startsWith("Camunda 8")) {
            return "c8";
        } else {
            return "both";
        }
    }

    /**
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     */
    async pickEngineVersion(platform: Engine, versions: readonly string[]): Promise<string> {
        const label = platform === "c7" ? "Camunda 7" : "Camunda 8";
        const result = await window.showQuickPick([...versions], {
            placeHolder: `Select ${label} engine version`,
        });

        if (result === undefined) {
            throw new UserCancelledError();
        }
        return result;
    }

    /**
     * Opens a multi-select quick pick over workspace files matching `glob`.
     *
     * Composes the workspace search and the picker so callers in `service/`
     * don't reach into the `vscode` namespace for either step.
     *
     * @returns Absolute paths of the chosen files, or `[]` if the user
     *   dismisses the picker.
     */
    async pickWorkspaceFiles(opts: {
        glob: string;
        exclude?: string | null;
        placeholder: string;
        limit?: number;
    }): Promise<string[]> {
        const paths = await this.vsWorkspace.findFiles(opts.glob, opts.exclude, opts.limit);

        const items = paths.map((p) => ({
            label: posix.basename(p),
            description: p,
            filePath: p,
        }));

        const picked = await window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: opts.placeholder,
            matchOnDescription: true,
        });

        return picked?.map((item) => item.filePath) ?? [];
    }

    /**
     * Returns `undefined` (not throws) on cancel: the user is free to back
     * out of a navigation prompt. Sorted by workspace-relative path so
     * nearby files surface first.
     */
    async pickReferencedModel(paths: string[]): Promise<string | undefined> {
        const items = paths
            .map((path) => ({
                label: posix.basename(path),
                description: workspace.asRelativePath(Uri.file(path)),
                path,
            }))
            .sort((a, b) => a.description.localeCompare(b.description));

        const picked = await window.showQuickPick(items, {
            placeHolder: "Select the referenced model to open",
        });
        return picked?.path;
    }
}
