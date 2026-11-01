import { debounce } from "min-dash";

/** The delay of the `@bpmn-io/properties-panel` default this service replaces. */
const INPUT_DEBOUNCE_MS = 600;

interface DebouncedInput<Args extends unknown[]> {
    (...args: Args): void;
    flush(): void;
    cancel(): void;
}

/**
 * The panel's `debounceInput` service: debounces each entry's input as the
 * library default does, and tracks the calls still waiting, so a save can
 * apply them before it exports the diagram.
 */
export interface FlushableDebounceInput {
    <Args extends unknown[]>(apply: (...args: Args) => void): DebouncedInput<Args>;
    /** Whether an entry's input still waits in its debounce. */
    hasPending(): boolean;
    /** Runs every waiting call now. */
    flush(): void;
}

export function createFlushableDebounceInput(delayMs = INPUT_DEBOUNCE_MS): FlushableDebounceInput {
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
                flush: () => scheduled.flush(),
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
            for (const input of [...waiting]) {
                input.flush();
            }
        },
    });
}

function debounceInputFactory(): FlushableDebounceInput {
    return createFlushableDebounceInput();
}

/** Registers the service under the library's `debounceInput` name, once per modeler. */
export const FlushableDebounceInputModule = {
    debounceInput: ["factory", debounceInputFactory],
};
