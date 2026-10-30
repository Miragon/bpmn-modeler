import { posix } from "path";

import { QuickPickItem, Uri, window, workspace } from "vscode";

import { UserCancelledError } from "@miragon/bpmn-modeler-core";
import { ChoiceIcon, ChoiceItem, ChoicePrompt, ConfirmRequest } from "@miragon/bpmn-modeler-core";
import { SearchPrompt } from "@miragon/bpmn-modeler-core";
import { DeploymentPickerPort, MigrationPickerPort, PickerPort } from "@miragon/bpmn-modeler-core";
import { classifyLocateResult, LocatePrompts, LocateResult } from "@miragon/bpmn-modeler-core";
import { MigrationScope } from "@miragon/bpmn-modeler-core";
import { ScriptLanguage } from "@miragon/bpmn-modeler-core";
import { summarizeAffectedItems } from "@miragon/bpmn-modeler-core";
import { NEW_MODEL_ENGINE_CHOICES, NewModelEngine } from "@miragon/bpmn-modeler-core";
import { VsCodeWorkspace } from "./VsCodeWorkspace";

import { Engine, ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

const BUSY_LIST_REVEAL_DELAY_MS = 150;

const CODICONS: Record<ChoiceIcon, string> = {
    swap: "arrow-swap",
    cloud: "cloud",
};

interface ChoiceQuickPickItem<V> extends QuickPickItem {
    readonly value: V;
}

function choiceQuickPickItem<V>(item: ChoiceItem<V>): ChoiceQuickPickItem<V> {
    return {
        label: item.icon ? `$(${CODICONS[item.icon]}) ${item.label}` : item.label,
        description:
            item.path !== undefined
                ? workspace.asRelativePath(Uri.file(item.path))
                : item.description,
        value: item.value,
    };
}

/**
 * Adapter around `window.showQuickPick` for the core's prompts: the generic ones
 * the core builds, and the feature-shaped ones (engine, migration scope,
 * referenced model, …) until they move to the core.
 *
 * Centralises quick-pick handling so services stay free of `vscode`
 * imports and the cancel-vs-throw convention is enforced in one place
 * instead of duplicated at every callsite.
 */
export class VsCodePicker implements PickerPort, DeploymentPickerPort, MigrationPickerPort {
    constructor(private readonly vsWorkspace: VsCodeWorkspace) {}

    async choose<V>(prompt: ChoicePrompt<V>): Promise<V | undefined> {
        const chosen = await window.showQuickPick(prompt.items.map(choiceQuickPickItem), {
            title: prompt.title,
            placeHolder: prompt.placeholder,
            matchOnDescription: true,
        });
        return chosen?.value;
    }

    async chooseMany<V>(prompt: ChoicePrompt<V>): Promise<readonly V[]> {
        const chosen = await window.showQuickPick(prompt.items.map(choiceQuickPickItem), {
            title: prompt.title,
            placeHolder: prompt.placeholder,
            matchOnDescription: true,
            canPickMany: true,
        });
        return chosen?.map((item) => item.value) ?? [];
    }

    async confirm(request: ConfirmRequest): Promise<boolean> {
        const choice = await window.showWarningMessage(
            request.title,
            { modal: true, detail: request.details.join("\n") },
            request.confirmLabel,
        );
        return choice === request.confirmLabel;
    }

    async searchAndChoose<R>(search: SearchPrompt<R>): Promise<{ outcome: R; chosen?: string }> {
        const qp = window.createQuickPick<ChoiceQuickPickItem<string>>();
        try {
            // Deferred so a fast search doesn't flash the list open and shut.
            let revealed = false;
            const revealTimer = setTimeout(() => {
                revealed = true;
                qp.busy = true;
                qp.placeholder = search.searchingPlaceholder;
                qp.show();
            }, BUSY_LIST_REVEAL_DELAY_MS);

            let outcome: R;
            try {
                outcome = await search.search();
            } finally {
                clearTimeout(revealTimer);
            }

            const choices = search.choices(outcome);
            if (!choices) {
                qp.hide();
                return { outcome, chosen: undefined };
            }

            qp.items = choices.items.map(choiceQuickPickItem);
            qp.title = choices.title;
            qp.placeholder = choices.placeholder;
            qp.matchOnDescription = true;
            qp.busy = false;
            if (!revealed) {
                qp.show();
            }

            const chosen = await new Promise<string | undefined>((resolve) => {
                qp.onDidAccept(() => resolve(qp.selectedItems[0]?.value));
                // A resolved promise ignores the settle of a later hide.
                qp.onDidHide(() => resolve(undefined));
            });
            return { outcome, chosen };
        } finally {
            qp.dispose();
        }
    }

    /**
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     */
    async pickNewModelEngine(placeHolder: string): Promise<NewModelEngine> {
        interface NewModelEngineItem extends QuickPickItem {
            id: NewModelEngine;
        }
        const qpItems: NewModelEngineItem[] = NEW_MODEL_ENGINE_CHOICES.map((choice) => ({
            label: choice.label,
            description: choice.description,
            id: choice.id,
        }));
        const result = await window.showQuickPick(qpItems, { placeHolder });

        if (result === undefined) {
            throw new UserCancelledError();
        }
        return result.id;
    }

    /**
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     */
    async pickMigrationScope(c7Count: number, c8Count: number): Promise<MigrationScope> {
        const items = [
            `${ENGINE_LABEL.c7} only (${c7Count} diagram${c7Count !== 1 ? "s" : ""})`,
            `${ENGINE_LABEL.c8} only (${c8Count} diagram${c8Count !== 1 ? "s" : ""})`,
            `Both (${c7Count + c8Count} diagram${c7Count + c8Count !== 1 ? "s" : ""})`,
        ];

        const result = await window.showQuickPick(items, {
            placeHolder: "Which diagrams do you want to migrate?",
        });

        if (result === undefined) {
            throw new UserCancelledError();
        } else if (result.startsWith(ENGINE_LABEL.c7)) {
            return "c7";
        } else if (result.startsWith(ENGINE_LABEL.c8)) {
            return "c8";
        } else {
            return "both";
        }
    }

    /**
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     */
    async pickEngineVersion(platform: Engine, versions: readonly string[]): Promise<string> {
        const label = ENGINE_LABEL[platform];
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
     * Returns `null` on cancel — start-instance is a user-initiated
     * workflow, not a navigation prompt, so a clean dismissal is expected
     * and must not throw. `matchOnDescription` lets users filter by the
     * full path when several payloads share a basename.
     */
    async pickPayloadFile(paths: string[]): Promise<{ filePath: string; label: string } | null> {
        const items = paths.map((p) => ({
            label: posix.basename(p),
            description: p,
            filePath: p,
        }));

        const picked = await window.showQuickPick(items, {
            canPickMany: false,
            placeHolder: "Select a payload file",
            matchOnDescription: true,
        });

        if (!picked) {
            return null;
        }
        return { filePath: picked.filePath, label: picked.label };
    }

    /**
     * Returns the picked Camunda `scriptFormat` (e.g. `"javascript"`) or
     * `undefined` on cancel — the open-script flow uses this to recover
     * when the BPMN model's `scriptFormat` is missing or set to a
     * language we don't ship IntelliSense for. The currently-set format
     * (if any) is pinned to the top so it remains the default highlighted
     * option even when unrecognised.
     */
    async pickScriptLanguage(currentFormat: string): Promise<string | undefined> {
        interface ScriptLanguageItem extends QuickPickItem {
            readonly format: string;
        }
        const items: ScriptLanguageItem[] = ScriptLanguage.supportedFormats().map((format) => ({
            label: format.charAt(0).toUpperCase() + format.slice(1),
            description: `.${new ScriptLanguage(format).extension}`,
            format,
        }));
        const normalized = currentFormat.toLowerCase().trim();
        items.sort((a, b) => {
            if (a.format === normalized) return -1;
            if (b.format === normalized) return 1;
            return 0;
        });

        const picked = await window.showQuickPick<ScriptLanguageItem>(items, {
            placeHolder: "Select the scripting language",
            title: "Script Language",
        });
        return picked?.format;
    }

    /**
     * Puts the search spinner on the selection list itself rather than the
     * status bar. Only an ambiguous result opens the list to pick from; the
     * service still owns the other cases via the returned `outcome`.
     *
     * Cancel resolves to `undefined` (never throws) — backing out of a
     * navigation prompt is expected. Sorted by workspace-relative path so nearby
     * files surface first.
     */
    async searchAndPickLocatedFile(
        prompts: LocatePrompts,
        search: () => Promise<LocateResult>,
    ): Promise<{ outcome: LocateResult; chosen?: string }> {
        const qp = window.createQuickPick<LocatedFileItem>();
        try {
            // Defer the reveal so a fast search doesn't flash the list open and
            // shut; slow searches still get the spinner.
            let revealed = false;
            const revealTimer = setTimeout(() => {
                revealed = true;
                qp.busy = true;
                qp.placeholder = prompts.searchingPlaceholder;
                qp.show();
            }, BUSY_LIST_REVEAL_DELAY_MS);

            let outcome: LocateResult;
            try {
                outcome = await search();
            } finally {
                clearTimeout(revealTimer);
            }

            const located = classifyLocateResult(outcome);
            if (located.kind !== "ambiguous") {
                // Nothing to pick — hide (in case the reveal already fired) and
                // hand the other cases back to the service.
                qp.hide();
                return { outcome, chosen: undefined };
            }

            const items = located.paths
                .map((path) => ({
                    label: posix.basename(path),
                    description: workspace.asRelativePath(Uri.file(path)),
                    path,
                }))
                .sort((a, b) => a.description.localeCompare(b.description));

            qp.items = items;
            qp.placeholder = prompts.pickPlaceholder;
            qp.busy = false;
            if (!revealed) {
                qp.show();
            }

            const chosen = await new Promise<string | undefined>((resolve) => {
                qp.onDidAccept(() => resolve(qp.selectedItems[0]?.path));
                // Escape/dismissal; a resolved promise ignores a later settle.
                qp.onDidHide(() => resolve(undefined));
            });

            return { outcome, chosen };
        } finally {
            qp.dispose();
        }
    }

    /**
     * Prompts for the active deployment target. An explicit
     * "(none — use form values)" entry (resolving to `""`) sits above the saved
     * targets; the active one is pre-marked. Returns `undefined` on dismissal so
     * the caller can no-op, mirroring the engine-version cancel convention.
     */
    async pickDeploymentTarget(names: string[]): Promise<string | undefined> {
        interface TargetItem extends QuickPickItem {
            readonly value: string;
        }
        const items: TargetItem[] = [
            { label: "(none — use form values)", value: "" },
            ...names.map((name) => ({ label: name, value: name })),
        ];

        const picked = await window.showQuickPick<TargetItem>(items, {
            placeHolder: "Select the active deployment target",
        });
        return picked?.value;
    }

    /**
     * The deployment status-bar item's click menu. The verify entry only
     * appears for a named Camunda 7 target — C8 has no deployment lookup.
     */
    async pickDeploymentStatusAction(opts: {
        targetName?: string;
        canVerify: boolean;
    }): Promise<"switch" | "verify" | undefined> {
        interface ActionItem extends QuickPickItem {
            readonly value: "switch" | "verify";
        }
        const items: ActionItem[] = [
            { label: "$(arrow-swap) Switch deployment target…", value: "switch" },
            ...(opts.canVerify
                ? [
                      {
                          label: `$(cloud) Verify on ${opts.targetName}`,
                          value: "verify" as const,
                      },
                  ]
                : []),
        ];

        const picked = await window.showQuickPick<ActionItem>(items, {
            placeHolder: opts.targetName
                ? `Deployment target "${opts.targetName}"`
                : "No deployment target selected",
        });
        return picked?.value;
    }

    /**
     * Modal confirmation listing what is about to be removed.
     *
     * Modal rather than a plain warning toast because the user is consenting to
     * deletion, and a toast can be missed or auto-dismissed.
     */
    async confirmDestructive(options: {
        title: string;
        confirmLabel: string;
        details: string[];
    }): Promise<boolean> {
        const choice = await window.showWarningMessage(
            options.title,
            { modal: true, detail: summarizeAffectedItems(options.details).join("\n") },
            options.confirmLabel,
        );
        return choice === options.confirmLabel;
    }
}

interface LocatedFileItem extends QuickPickItem {
    readonly path: string;
}
