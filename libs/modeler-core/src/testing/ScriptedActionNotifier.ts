import { ActionNotice } from "../kernel/domain/actionNotice";
import { ActionNotifierPort } from "../kernel/port/hostPorts";

/** Scripted clicks, keyed by notice id: the value of the action the user clicks. */
export type NoticeAnswers = Record<string, unknown>;

/**
 * Answers each notice from `noticeAnswers` by its id. An unanswered notice is
 * closed (`undefined`), so a test exercises the caller's dismissal path by
 * leaving it out. A scripted value the notice does not offer throws, so a test
 * cannot pass with an action the user was never shown. A notice held with
 * {@link holdNextNotice} stays open until the test answers it, as a host's
 * notification can.
 */
export class ScriptedActionNotifier implements ActionNotifierPort {
    readonly notices: ActionNotice<unknown>[] = [];

    private readonly heldAnswers: Promise<unknown>[] = [];

    constructor(readonly noticeAnswers: NoticeAnswers = {}) {}

    /** `answer` clicks the action with that value; `undefined` closes the notice. */
    holdNextNotice(): { answer(value: unknown): void } {
        let answer: (value: unknown) => void = () => undefined;
        this.heldAnswers.push(
            new Promise((resolve) => {
                answer = resolve;
            }),
        );
        return { answer: (value) => answer(value) };
    }

    async offer<V>(notice: ActionNotice<V>): Promise<V | undefined> {
        this.notices.push(notice);
        const held = this.heldAnswers.shift();
        const answer = held === undefined ? this.noticeAnswers[notice.id] : await held;
        if (answer === undefined) {
            return undefined;
        }
        const offered = notice.actions.find((action) => action.value === answer);
        if (!offered) {
            throw new Error(`${JSON.stringify(answer)} is not an action of notice "${notice.id}"`);
        }
        return offered.value;
    }
}
