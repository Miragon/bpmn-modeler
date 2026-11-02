import { QuickPickItem, Uri, window, workspace } from "vscode";

import {
    ChoiceIcon,
    ChoiceItem,
    ChoicePrompt,
    ConfirmRequest,
    PickerPort,
    SearchPrompt,
} from "@miragon/bpmn-modeler-core";

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
 * Renders the core's prompts as quick picks and modal warnings. A dismissal
 * comes back as the port's answer (`undefined`, `[]` or `false`), so the caller
 * decides whether it cancels.
 */
export class VsCodePicker implements PickerPort {
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
}
