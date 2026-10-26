export type StatusItemRelease = "hide" | "keep";

export class StatusItemOwnership {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    claim(_editorId: string): void {}

    release(_editorId: string): StatusItemRelease {
        return "hide";
    }
}
