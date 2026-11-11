import { AllowableCode, isAllowed } from "./allowance";
import { CodeApproval } from "./codeApproval";

/**
 * Workspace code runs only where the user trusts the workspace, and there only
 * once its allowance holds: an allowance of the repository does not reach a
 * worktree the user did not trust.
 */
export function runsInWorkspace(
    code: AllowableCode,
    rows: readonly CodeApproval[],
    trusted: boolean,
): boolean {
    return trusted && isAllowed(code, rows);
}

/** Allowing code in a workspace the user did not trust would not run it, so nothing asks; trusting comes first. */
export function askedInWorkspace<C>(pending: readonly C[], trusted: boolean): readonly C[] {
    return trusted ? pending : [];
}
