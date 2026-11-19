/**
 * Which text one element XML merge answers when its last tab closes: the one
 * the user's last manual save wrote. An auto-save is no answer, since the
 * result is dirty from the start and would be written before the user did
 * anything. A close while the user accepts the merge answers with the last
 * write: the editor's accept saves only a dirty result, so after an auto-save
 * it writes nothing. A merge closed from code answers nothing.
 */
export class MergeTabAnswer {
    private manualSaveUnderway = false;
    private manuallySaved: string | undefined;
    private acceptUnderway = false;
    private closedFromCode = false;

    /** A save of the result starts; only a manual one answers. */
    willSave(manual: boolean): void {
        this.manualSaveUnderway = manual;
    }

    /** The save that started wrote `written`. */
    saved(written: string | undefined): void {
        if (!this.manualSaveUnderway) return;
        this.manuallySaved = written;
        this.manualSaveUnderway = false;
    }

    accepting(): void {
        this.acceptUnderway = true;
    }

    acceptEnded(): void {
        this.acceptUnderway = false;
    }

    closingFromCode(): void {
        this.closedFromCode = true;
    }

    /** The answer once the last tab closed, given the last text an editor wrote to the result. */
    onClose(lastWrite: string | undefined): string | undefined {
        if (this.closedFromCode) return undefined;
        return this.acceptUnderway ? lastWrite : this.manuallySaved;
    }
}
