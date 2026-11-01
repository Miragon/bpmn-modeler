import debounce from "lodash/debounce.js";

// An entry may debounce twice (a number field inside a FEEL field), so one pass
// can schedule another; the cap stops input that schedules itself on every run.
const MAX_FLUSH_PASSES = 10;

interface DebouncedInput<Args extends unknown[]> {
    (...args: Args): void;
    flush(): void;
    cancel(): void;
}

/**
 * An editor's input debounce service (`debounceInput` in the bpmn-io
 * properties panels and the dmn-js editors, `debounce` in form-js): debounces
 * each input as the library default it replaces does, and tracks the calls
 * still waiting, so a save can apply them before it exports the document.
 */
export interface FlushableDebounceInput {
    <Args extends unknown[]>(apply: (...args: Args) => void): DebouncedInput<Args>;
    /** Whether an input still waits in its debounce. */
    hasPending(): boolean;
    /**
     * Runs every waiting call now, and the calls those runs debounce in turn.
     * A failing call does not hold back the others; its error is rethrown
     * once the rest have run.
     */
    flush(): void;
}

export function createFlushableDebounceInput(delayMs: number): FlushableDebounceInput {
    const waiting = new Set<{ flush(): void }>();

    function debounceInput<Args extends unknown[]>(
        apply: (...args: Args) => void,
    ): DebouncedInput<Args> {
        const scheduled = debounce((...args: Args) => {
            waiting.delete(input);
            apply(...args);
        }, delayMs);
        const input: DebouncedInput<Args> = Object.assign(
            (...args: Args) => {
                waiting.add(input);
                scheduled(...args);
            },
            {
                flush: () => {
                    scheduled.flush();
                },
                cancel: () => {
                    waiting.delete(input);
                    scheduled.cancel();
                },
            },
        );
        return input;
    }

    return Object.assign(debounceInput, {
        hasPending: () => waiting.size > 0,
        flush: () => {
            const failures: unknown[] = [];
            for (let pass = 0; pass < MAX_FLUSH_PASSES && waiting.size > 0; pass++) {
                for (const input of [...waiting]) {
                    try {
                        input.flush();
                    } catch (failure) {
                        failures.push(failure);
                    }
                }
            }
            if (failures.length > 0) {
                throw failures[0];
            }
        },
    });
}
