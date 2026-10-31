import { CredentialDestinationNotApprovedError } from "../domain/errors";
import { PickerPort } from "../../kernel/domain/hostPorts";
import { CredentialDestinations } from "../domain/credentialDestinations";
import { DeploymentDestination } from "../domain/deploymentDestination";
import { credentialApprovalConfirmation } from "../domain/deploymentPrompts";
import { SecretStorePort } from "../domain/ports";

/**
 * Keeps a named target's credentials and `.env` values from following its
 * shared definition to a new host: the targets file is committed, so a change
 * someone else pushed must not silently redirect this developer's secrets.
 * Approvals live beside the credentials, per developer.
 */
export class CredentialApprovalService {
    constructor(
        private readonly secretStore: SecretStorePort,
        private readonly picker: PickerPort,
    ) {}

    /**
     * Asks before secrets reach an origin not yet approved for them, and
     * remembers the answer.
     *
     * @param destination Holds the approvals under its slot.
     * @param destinations The resolved origins the request is about to send
     *   credentials or `.env` values to.
     * @throws {CredentialDestinationNotApprovedError} when the user declines.
     */
    async ensureApproved(
        destination: DeploymentDestination,
        destinations: CredentialDestinations,
    ): Promise<void> {
        if (destinations.isEmpty()) {
            return;
        }
        const approved = CredentialDestinations.fromOrigins(
            await this.secretStore.getApprovedDestinations(destination.approvalSlot),
        );
        const unapproved = destinations.without(approved);
        if (unapproved.isEmpty()) {
            return;
        }

        const confirmed = await this.picker.confirm(
            credentialApprovalConfirmation({
                connectionLabel: destination.connectionLabel,
                approved,
                unapproved,
            }),
        );
        if (!confirmed) {
            throw new CredentialDestinationNotApprovedError(destination.connectionName);
        }
        await this.secretStore.saveApprovedDestinations(destination.approvalSlot, [
            ...approved.union(unapproved).origins,
        ]);
    }
}
