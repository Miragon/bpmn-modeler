import {
    type MergePaneCommand,
    MergePaneCommandsChangedCommand,
} from "@miragon/bpmn-modeler-shared";

import { mergePaneCommands, padDecisionFor } from "../../domain/mergePaneCommands";
import type { MergePadDecision } from "../../domain/mergePadDecisions";

/** The element whose context pad is open, and what the pad offers on it. */
export interface MergeSelectedPad {
    readonly id?: string;
    readonly decisions: readonly MergePadDecision[];
}

export interface MergePaneKeyboardContext {
    readonly post: (command: MergePaneCommandsChangedCommand) => void;
    /** Steps as ‹ › do. */
    readonly step: (direction: 1 | -1) => void;
    /** Posts the build, as the bar's Build does. */
    readonly build: () => void;
    readonly selectedPad: () => MergeSelectedPad;
    /** Sends a pad decision on an element, as the pad does. */
    readonly decide: (elementId: string, decision: MergePadDecision) => void;
}

/**
 * A merge pane's keyboard commands: tells the host what they can do, once
 * per change, and runs one as the pad's entry on the selected element, ‹ ›
 * or Build does.
 */
export class MergePaneKeyboard {
    private reported: string | undefined;

    constructor(private readonly context: MergePaneKeyboardContext) {}

    run(command: MergePaneCommand): void {
        switch (command) {
            case "next":
                this.context.step(1);
                return;
            case "previous":
                this.context.step(-1);
                return;
            case "build":
                this.context.build();
                return;
            default: {
                const { id, decisions } = this.context.selectedPad();
                const decision = padDecisionFor(decisions, command);
                if (id !== undefined && decision !== undefined) this.context.decide(id, decision);
            }
        }
    }

    report({ canStep }: { readonly canStep: boolean }): void {
        const available = mergePaneCommands(this.context.selectedPad().decisions, { canStep });
        const reported = available.join();
        if (reported === this.reported) return;
        this.reported = reported;
        this.context.post(new MergePaneCommandsChangedCommand(available));
    }
}
