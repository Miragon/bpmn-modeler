import { debounce } from "min-dash";

export const INPUT_DEBOUNCE_MS = 600;

export interface DebouncedInput<Args extends unknown[]> {
    (...args: Args): void;
    flush(): void;
    cancel(): void;
}

export interface FlushableDebounceInput {
    <Args extends unknown[]>(apply: (...args: Args) => void): DebouncedInput<Args>;
    hasPending(): boolean;
    flush(): void;
}

export function createFlushableDebounceInput(delayMs = INPUT_DEBOUNCE_MS): FlushableDebounceInput {
    function debounceInput<Args extends unknown[]>(
        apply: (...args: Args) => void,
    ): DebouncedInput<Args> {
        return debounce(apply, delayMs);
    }

    return Object.assign(debounceInput, {
        hasPending: () => false,
        flush: () => {},
    });
}
