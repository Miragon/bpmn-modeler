import { CredentialDestinationNotApprovedError } from "../../shared/domain/errors";
import { PickerPort, SecretStorePort } from "../../shared/domain/hostPorts";
import { CredentialDestinations } from "../domain/credentialDestinations";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { DeploymentTargetService } from "./DeploymentTargetService";

const AD_HOC_SLOT = "ad-hoc";
const MAX_SHOWN_NAME_LENGTH = 60;

/**
 * Keeps a named target's credentials and `.env` values from following its
 * shared definition to a new host: the targets file is committed, so a change
 * someone else pushed must not silently redirect this developer's secrets.
 * Approvals live beside the credentials, per developer.
 */
export class CredentialApprovalService {
    constructor(
        private readonly targetSlots: Pick<DeploymentTargetService, "resolveSlot">,
        private readonly secretStore: SecretStorePort,
        private readonly picker: PickerPort,
    ) {}

    /**
     * Asks before secrets reach an origin not yet approved for them, and
     * remembers the answer.
     *
     * @param target The named target; ad-hoc requests share one approval slot,
     *   as they share one set of stored credentials.
     * @param destinations The resolved origins the request is about to send
     *   credentials or `.env` values to.
     * @throws {CredentialDestinationNotApprovedError} when the user declines.
     */
    async ensureApproved(
        target: DeploymentTarget | undefined,
        documentDir: string | undefined,
        destinations: CredentialDestinations,
    ): Promise<void> {
        if (destinations.isEmpty()) {
            return;
        }
        const slot =
            target === undefined
                ? AD_HOC_SLOT
                : await this.targetSlots.resolveSlot(target.name, documentDir);
        const approved = CredentialDestinations.fromOrigins(
            slot === undefined ? [] : await this.secretStore.getApprovedDestinations(slot),
        );
        const unapproved = destinations.without(approved);
        if (unapproved.isEmpty()) {
            return;
        }

        const connection = target === undefined ? "the ad-hoc connection" : shownName(target);
        // The host leads: the target name comes from the shared file and must not
        // be able to push it out of sight.
        const confirmed = await this.picker.confirmDestructive({
            title: `Send credentials and .env values to ${unapproved}?`,
            confirmLabel: "Send Credentials",
            details: [
                `They belong to ${connection}.`,
                approved.isEmpty()
                    ? "No host is approved for them yet."
                    : `Approved so far: ${approved}.`,
                "The shared deployment targets file and .env decide where they go. Continue only if you expect this host.",
            ],
        });
        if (!confirmed) {
            throw new CredentialDestinationNotApprovedError(target?.name ?? "ad-hoc");
        }
        if (slot !== undefined) {
            await this.secretStore.saveApprovedDestinations(slot, [
                ...approved.union(unapproved).origins,
            ]);
        }
    }
}

function shownName(target: DeploymentTarget): string {
    const singleLine = target.name.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}"]+/gu, " ").trim();
    const shortened =
        singleLine.length > MAX_SHOWN_NAME_LENGTH
            ? `${singleLine.slice(0, MAX_SHOWN_NAME_LENGTH)}…`
            : singleLine;
    return `target "${shortened}"`;
}
