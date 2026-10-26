export type StatusItemRelease = "hide" | "keep";

/**
 * Every editor shares one status item, and hosts may deliver the previous
 * editor's blur after the next editor's focus, so only the last claimant hides it.
 */
export class StatusItemOwnership {
    private owner: string | undefined;

    claim(editorId: string): void {
        this.owner = editorId;
    }

    release(editorId: string): StatusItemRelease {
        if (this.owner !== editorId) return "keep";
        this.owner = undefined;
        return "hide";
    }
}
