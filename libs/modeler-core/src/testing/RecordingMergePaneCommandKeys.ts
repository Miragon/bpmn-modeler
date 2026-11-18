import { MergePaneCommandKeys, MergePaneCommandKeysState } from "../diff/port/MergePaneCommandKeys";

/** Where a host shows the merge panes' keyboard commands, in memory: every state the core showed, in order. */
export class RecordingMergePaneCommandKeys implements MergePaneCommandKeys {
    readonly states: MergePaneCommandKeysState[] = [];

    show(state: MergePaneCommandKeysState): void {
        this.states.push({ ...state, available: [...state.available] });
    }

    /** The state the keys show now, none offered before the core showed one. */
    get current(): MergePaneCommandKeysState {
        return (
            this.states[this.states.length - 1] ?? {
                focused: false,
                targeted: false,
                available: [],
            }
        );
    }
}
