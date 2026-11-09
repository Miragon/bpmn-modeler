/**
 * One question to the user open at a time, across every approval kind. A host
 * composition shares one queue, so two notices never stand side by side. It
 * orders questions for the user, not writes: each answer is a change the host
 * merges, so no answer can drop a row another one stored.
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
