import { MergeCommandAvailability } from "../diff/port/MergeCommandAvailability";

/** Where a host shows the merge view's command, in memory: every list the core set, in order. */
export class RecordingMergeCommandAvailability implements MergeCommandAvailability {
    readonly lists: (readonly string[])[] = [];

    setResolvable(fileUris: readonly string[]): void {
        this.lists.push([...fileUris]);
    }

    /** The list the command shows for now, `[]` before the core set one. */
    get resolvable(): readonly string[] {
        return this.lists[this.lists.length - 1] ?? [];
    }
}
