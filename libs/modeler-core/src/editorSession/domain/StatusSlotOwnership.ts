import { StatusSlot } from "../../kernel/domain/statusView";

export type StatusSlotRelease = "hide" | "keep";

/**
 * Every editor shares each status slot, and hosts may deliver the previous
 * editor's blur after the next editor's focus, so only a slot's last claimant
 * hides it. A claimant is one exact session, never an editor URI, so a closed
 * session's late release cannot hide what its same-URI replacement shows.
 */
export class StatusSlotOwnership {
    private readonly owners = new Map<StatusSlot, object>();

    claim(slot: StatusSlot, session: object): void {
        this.owners.set(slot, session);
    }

    release(slot: StatusSlot, session: object): StatusSlotRelease {
        if (this.owners.get(slot) !== session) return "keep";
        this.owners.delete(slot);
        return "hide";
    }
}
