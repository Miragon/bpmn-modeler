/** Runs writes one at a time, in the order queued; a failed write does not hold up the next. */
export class WriteQueue {
    private last: Promise<unknown> = Promise.resolve();

    run<T>(write: () => Promise<T>): Promise<T> {
        const written = this.last.then(write);
        this.last = written.catch(() => undefined);
        return written;
    }
}
