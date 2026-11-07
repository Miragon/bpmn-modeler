import { window } from "vscode";

import { ActionNotice, ActionNoticeTone, ActionNotifierPort } from "@miragon/bpmn-modeler-core";

type ShowMessage = (message: string, ...actions: string[]) => Thenable<string | undefined>;

const SHOW_BY_TONE: Record<ActionNoticeTone, ShowMessage> = {
    info: (message, ...actions) => window.showInformationMessage(message, ...actions),
    warning: (message, ...actions) => window.showWarningMessage(message, ...actions),
};

/** A notification with one button per action; closing it answers nothing. */
export class VsCodeActionNotifier implements ActionNotifierPort {
    async offer<V>(notice: ActionNotice<V>): Promise<V | undefined> {
        const clicked = await SHOW_BY_TONE[notice.tone](
            notice.message,
            ...notice.actions.map((action) => action.label),
        );
        return notice.actions.find((action) => action.label === clicked)?.value;
    }
}
