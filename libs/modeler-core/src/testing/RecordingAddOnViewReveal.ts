import { AddOnViewRevealPort } from "../addOns/port/addOnViewPorts";

/** A host's add-ons view that records the rows it was asked to show. */
export class RecordingAddOnViewReveal implements AddOnViewRevealPort {
    readonly revealed: string[][] = [];

    /** @param shows whether the host can show its view */
    constructor(private readonly options: { readonly shows: boolean } = { shows: true }) {}

    async reveal(addOnIds: readonly string[]): Promise<boolean> {
        this.revealed.push([...addOnIds]);
        return this.options.shows;
    }
}
