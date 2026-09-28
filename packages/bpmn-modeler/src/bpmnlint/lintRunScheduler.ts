export interface LintRunTimers {
    now(): number;
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
    requestIdleCallback?(callback: () => void, options: { timeout: number }): unknown;
    cancelIdleCallback?(handle: unknown): void;
}

export type LintRun = (isCurrent: () => boolean) => Promise<void>;

const MIN_QUIET_PERIOD_MS = 300;
const MAX_QUIET_PERIOD_MS = 5000;
const IDLE_TIMEOUT_MS = 1000;

function browserTimers(): LintRunTimers {
    return {
        now: () => performance.now(),
        setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
        clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
        // Safari has no requestIdleCallback.
        ...(typeof globalThis.requestIdleCallback === "function" && {
            requestIdleCallback: (callback, options) =>
                globalThis.requestIdleCallback(callback, options),
            cancelIdleCallback: (handle) => globalThis.cancelIdleCallback(handle as number),
        }),
    };
}

export class LintRunScheduler {
    private cancelPendingStep?: () => void;

    private runInFlight = false;

    private trailingRunRequested = false;

    private generation = 0;

    private lastRunDurationMs = 0;

    constructor(
        private readonly run: LintRun,
        private readonly timers: LintRunTimers = browserTimers(),
    ) {}

    request(): void {
        if (this.runInFlight) {
            this.trailingRunRequested = true;
            return;
        }
        this.clearPendingStep();
        // Armed from a follow-up task so a long triggering task cannot use up the quiet period.
        this.afterTimeout(0, () =>
            this.afterTimeout(this.quietPeriodMs(), () => this.whenIdle(() => void this.start())),
        );
    }

    cancel(): void {
        this.generation++;
        this.trailingRunRequested = false;
        this.clearPendingStep();
    }

    // A pass blocks the main thread, so the canvas must stay quiet about as long as one
    // takes; otherwise edits spaced wider than a fixed debounce each pay a full pass.
    private quietPeriodMs(): number {
        return Math.min(MAX_QUIET_PERIOD_MS, Math.max(MIN_QUIET_PERIOD_MS, this.lastRunDurationMs));
    }

    private async start(): Promise<void> {
        this.cancelPendingStep = undefined;
        this.runInFlight = true;
        const runGeneration = this.generation;
        const startedAt = this.timers.now();
        try {
            await this.run(() => runGeneration === this.generation);
        } finally {
            this.lastRunDurationMs = this.timers.now() - startedAt;
            this.runInFlight = false;
            if (this.trailingRunRequested) {
                this.trailingRunRequested = false;
                this.request();
            }
        }
    }

    private afterTimeout(delayMs: number, next: () => void): void {
        const handle = this.timers.setTimeout(next, delayMs);
        this.cancelPendingStep = () => this.timers.clearTimeout(handle);
    }

    private whenIdle(next: () => void): void {
        const timers = this.timers;
        if (!timers.requestIdleCallback || !timers.cancelIdleCallback) {
            this.afterTimeout(0, next);
            return;
        }
        const handle = timers.requestIdleCallback(next, { timeout: IDLE_TIMEOUT_MS });
        this.cancelPendingStep = () => timers.cancelIdleCallback?.(handle);
    }

    private clearPendingStep(): void {
        this.cancelPendingStep?.();
        this.cancelPendingStep = undefined;
    }
}
