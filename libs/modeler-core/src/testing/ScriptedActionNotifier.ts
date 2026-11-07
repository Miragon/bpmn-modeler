import { ActionNotice } from "../kernel/domain/actionNotice";
import { ActionNotifierPort } from "../kernel/port/hostPorts";

/** Scripted clicks, keyed by notice id: the value of the action the user clicks. */
export type NoticeAnswers = Record<string, unknown>;

/**
 * Answers each notice from `noticeAnswers` by its id. An unanswered notice is
 * closed (`undefined`), so a test exercises the caller's dismissal path by
 * leaving it out. A scripted value the notice does not offer throws, so a test
 * cannot pass with an action the user was never shown.
 */
export class ScriptedActionNotifier implements ActionNotifierPort {
    readonly notices: ActionNotice<unknown>[] = [];

    constructor(readonly noticeAnswers: NoticeAnswers = {}) {}

    async offer<V>(notice: ActionNotice<V>): Promise<V | undefined> {
        this.notices.push(notice);
        if (!(notice.id in this.noticeAnswers)) {
            return undefined;
        }
        const answer = this.noticeAnswers[notice.id];
        const offered = notice.actions.find((action) => action.value === answer);
        if (!offered) {
            throw new Error(`${JSON.stringify(answer)} is not an action of notice "${notice.id}"`);
        }
        return offered.value;
    }
}
