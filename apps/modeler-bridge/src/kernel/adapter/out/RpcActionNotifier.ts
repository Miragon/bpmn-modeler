import { ActionNotice, ActionNotifierPort } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { ActionNoticeShowParams, ActionNoticeShowResult } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";

/**
 * Real {@link ActionNotifierPort} over RPC: the host shows an IntelliJ
 * notification balloon with one action per label and replies with the index
 * of the clicked one, or none once the notification expired; this class maps
 * the index back to the offered value.
 */
export class RpcActionNotifier implements ActionNotifierPort {
    constructor(private readonly rpc: Rpc) {}

    async offer<V>(notice: ActionNotice<V>): Promise<V | undefined> {
        const result = (await this.rpc.request(METHODS.actionNoticeShow, {
            tone: notice.tone,
            message: notice.message,
            labels: notice.actions.map((action) => action.label),
        } satisfies ActionNoticeShowParams)) as ActionNoticeShowResult | null;
        const chosen = result?.chosen;
        return typeof chosen === "number" ? valueAt(notice, chosen) : undefined;
    }
}

function valueAt<V>(notice: ActionNotice<V>, index: number): V {
    const action = notice.actions[index];
    if (!action) {
        throw new Error(`actionNotice/show chose action ${index} of notice "${notice.id}"`);
    }
    return action.value;
}
