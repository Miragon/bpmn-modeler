/**
 * One question to the user open at a time, across every approval kind. A host
 * composition shares one queue, so two notices never stand side by side and
 * each answer reads the approval list the previous one wrote: a store such as
 * the bridge's sets its list only after the host acknowledged the save.
 */
export class QuestionQueue {
    private last: Promise<unknown> = Promise.resolve();

    /** @returns the question's answer, or its failure, once every earlier question settled. */
    ask<T>(question: () => Promise<T>): Promise<T> {
        const asked = this.last.then(question);
        this.last = asked.catch(() => undefined);
        return asked;
    }
}
