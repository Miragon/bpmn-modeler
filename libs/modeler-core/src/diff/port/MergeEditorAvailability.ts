/** Whether the host can open its element XML merge editor; known once the host listed its commands. */
export interface MergeEditorAvailability {
    readonly ready: Promise<boolean>;
}
