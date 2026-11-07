import { MessageItem, window } from "vscode";

import {
    ActionNotice,
    ActionNoticeTone,
    ActionNotifierPort,
    NoticeAction,
} from "@miragon/bpmn-modeler-core";

interface ActionButton<V> extends MessageItem {
    readonly action: NoticeAction<V>;
}

type ShowMessage = <T extends MessageItem>(message: string, ...items: T[]) => Thenable<T | undefined>;

const SHOW_BY_TONE: Record<ActionNoticeTone, ShowMessage> = {
    info: (message, ...items) => window.showInformationMessage(message, ...items),
    warning: (message, ...items) => window.showWarningMessage(message, ...items),
};

/**
 * A notification with one button per action; closing it answers nothing.
 * VS Code returns the clicked item itself, so two equal labels still answer
 * their own values.
 */
export class VsCodeActionNotifier implements ActionNotifierPort {
    async offer<V>(notice: ActionNotice<V>): Promise<V | undefined> {
        const buttons: ActionButton<V>[] = notice.actions.map((action) => ({
            title: action.label,
            action,
        }));
        const clicked = await SHOW_BY_TONE[notice.tone](notice.message, ...buttons);
        return clicked?.action.value;
    }
}
