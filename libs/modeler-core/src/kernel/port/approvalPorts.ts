import { CodeApproval, CodeApprovalChange, ReviewAnswer } from "../domain/codeApproval";
import { ChoicePrompt } from "../domain/prompts";

/**
 * The user's code approvals, every kind in one list, kept by the host outside
 * every workspace (VS Code's global state, IntelliJ's application settings),
 * so a cloned repository cannot approve its own code.
 */
export interface PluginApprovalStorePort {
    /** Synchronous; an IntelliJ mirror may lag the host by one push. */
    read(): readonly CodeApproval[];
    /**
     * The host merges the change into the list it stores, with
     * `approvalsAfter`, in one step, so a row another writer stored stays.
     * Rejects a change that names an id twice and stores nothing then.
     * Resolves once `read()` includes the change.
     */
    change(change: CodeApprovalChange): Promise<void>;
    /**
     * The host's stored list, asked for now rather than taken from a mirror, or
     * a newer one the store heard of meanwhile; `read()` returns it from then on.
     * VS Code returns this window's memento, which can lag another window's
     * write, so a prune there may delete a copy that window just wrote; the
     * check on disk before serving writes it again.
     */
    readStored(): Promise<readonly CodeApproval[]>;
    /**
     * Once the store learns of a new list: its own change, a host push or
     * `readStored`. Never for a list of the same rows. Another writer's list
     * can show in `read()` before the store learns of it.
     */
    onDidChange(listener: () => void): { dispose(): void };
}

export interface ApprovalReviewRequest {
    readonly prompt: ChoicePrompt<string>;
    /** Every pending artifact, each one the value of a prompt item. */
    readonly artifactIds: readonly string[];
    /** The folders the prompt was built for, so a review decides on the same reading. */
    readonly workspaceFolders: readonly string[];
}

/** Where "Review…" takes the user: a list to check, or a view the pending code is left to. */
export interface ApprovalReviewPort {
    review(request: ApprovalReviewRequest): Promise<ReviewAnswer>;
}
