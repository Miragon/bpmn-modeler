import { AuthTypePayload } from "@miragon/bpmn-modeler-shared";

import { DeployedRevision } from "../deployment/domain/deploymentLedger";
import { DeploymentStatePort } from "../shared/domain/hostPorts";

export class InMemoryDeploymentState implements DeploymentStatePort {
    endpoint = "";
    tenantId = "";
    authType: AuthTypePayload = "none";
    tokenEndpoint = "";
    audience = "";
    activeTargetName = "";
    readonly ledger = new Map<string, DeployedRevision>();

    getEndpoint(): string {
        return this.endpoint;
    }

    getTenantId(): string {
        return this.tenantId;
    }

    getAuthType(): AuthTypePayload {
        return this.authType;
    }

    async saveAuthType(authType: AuthTypePayload): Promise<void> {
        this.authType = authType;
    }

    getTokenEndpoint(): string {
        return this.tokenEndpoint;
    }

    getAudience(): string {
        return this.audience;
    }

    async saveOAuth2Config(tokenEndpoint: string, audience: string): Promise<void> {
        this.tokenEndpoint = tokenEndpoint;
        this.audience = audience;
    }

    async save(endpoint: string, tenantId: string): Promise<void> {
        this.endpoint = endpoint;
        this.tenantId = tenantId;
    }

    getActiveTargetName(): string {
        return this.activeTargetName;
    }

    async saveActiveTargetName(name: string): Promise<void> {
        this.activeTargetName = name;
    }

    getDeployedRevision(ledgerKey: string): DeployedRevision | undefined {
        return this.ledger.get(ledgerKey);
    }

    async saveDeployedRevision(ledgerKey: string, revision: DeployedRevision): Promise<void> {
        this.ledger.set(ledgerKey, revision);
    }

    listLedgerKeys(): string[] {
        return [...this.ledger.keys()];
    }

    async deleteDeployedRevisions(ledgerKeys: string[]): Promise<void> {
        for (const key of ledgerKeys) {
            this.ledger.delete(key);
        }
    }
}
