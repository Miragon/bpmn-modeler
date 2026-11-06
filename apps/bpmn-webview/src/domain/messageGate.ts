/**
 * Holds messages until {@link open}, then replays them in arrival order and lets
 * every later message through. Replay is synchronous so a message delivered
 * after `open()` can never overtake a held one.
 */
export class MessageGate<T> {
    private held: T[] | undefined = [];

    constructor(private readonly deliver: (message: T) => void) {}

    /** @returns `false` once the gate is open or discarded — the caller handles the message itself. */
    hold(message: T): boolean {
        if (!this.held) {
            return false;
        }
        this.held.push(message);
        return true;
    }

    open(): void {
        const held = this.held ?? [];
        this.held = undefined;
        held.forEach((message) => this.deliver(message));
    }

    discard(): void {
        this.held = undefined;
    }
}
