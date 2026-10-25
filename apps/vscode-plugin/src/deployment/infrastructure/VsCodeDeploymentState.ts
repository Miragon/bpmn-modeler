import { Memento } from "vscode";

import { AuthTypePayload } from "@miragon/bpmn-modeler-shared";

import { DeployedRevision, DeploymentStatePort } from "@miragon/bpmn-modeler-core";

/**
 * Persists deployment form state (endpoint, tenantId, authType, OAuth2 config)
 * across VS Code sessions in the extension's `workspaceState`.
 */
export class VsCodeDeploymentState implements DeploymentStatePort {
    private static readonly ENDPOINT_KEY = "bpmn-modeler.deployment.endpoint";

    private static readonly TENANT_ID_KEY = "bpmn-modeler.deployment.tenantId";

    private static readonly AUTH_TYPE_KEY = "bpmn-modeler.deployment.authType";

    private static readonly TOKEN_ENDPOINT_KEY = "bpmn-modeler.deployment.tokenEndpoint";

    private static readonly AUDIENCE_KEY = "bpmn-modeler.deployment.audience";

    private static readonly ACTIVE_TARGET_KEY = "bpmn-modeler.deployment.activeTargetName";

    private static readonly LEDGER_KEY = "bpmn-modeler.deployment.ledger";

    constructor(private readonly workspaceState: Memento) {}

    getEndpoint(): string {
        return this.workspaceState.get<string>(VsCodeDeploymentState.ENDPOINT_KEY, "");
    }

    getTenantId(): string {
        return this.workspaceState.get<string>(VsCodeDeploymentState.TENANT_ID_KEY, "");
    }

    getAuthType(): AuthTypePayload {
        return this.workspaceState.get<AuthTypePayload>(
            VsCodeDeploymentState.AUTH_TYPE_KEY,
            "none",
        );
    }

    async saveAuthType(authType: AuthTypePayload): Promise<void> {
        await this.workspaceState.update(VsCodeDeploymentState.AUTH_TYPE_KEY, authType);
    }

    getTokenEndpoint(): string {
        return this.workspaceState.get<string>(VsCodeDeploymentState.TOKEN_ENDPOINT_KEY, "");
    }

    getAudience(): string {
        return this.workspaceState.get<string>(VsCodeDeploymentState.AUDIENCE_KEY, "");
    }

    async saveOAuth2Config(tokenEndpoint: string, audience: string): Promise<void> {
        await this.workspaceState.update(VsCodeDeploymentState.TOKEN_ENDPOINT_KEY, tokenEndpoint);
        await this.workspaceState.update(VsCodeDeploymentState.AUDIENCE_KEY, audience);
    }

    async save(endpoint: string, tenantId: string): Promise<void> {
        await this.workspaceState.update(VsCodeDeploymentState.ENDPOINT_KEY, endpoint);
        await this.workspaceState.update(VsCodeDeploymentState.TENANT_ID_KEY, tenantId);
    }

    getActiveTargetName(): string {
        return this.workspaceState.get<string>(VsCodeDeploymentState.ACTIVE_TARGET_KEY, "");
    }

    async saveActiveTargetName(name: string): Promise<void> {
        await this.workspaceState.update(VsCodeDeploymentState.ACTIVE_TARGET_KEY, name);
    }

    getDeployedRevision(ledgerKey: string): DeployedRevision | undefined {
        return this.readLedger()[ledgerKey];
    }

    async saveDeployedRevision(ledgerKey: string, revision: DeployedRevision): Promise<void> {
        const ledger = { ...this.readLedger(), [ledgerKey]: revision };
        await this.workspaceState.update(VsCodeDeploymentState.LEDGER_KEY, ledger);
    }

    listLedgerKeys(): string[] {
        return Object.keys(this.readLedger());
    }

    async deleteDeployedRevisions(ledgerKeys: string[]): Promise<void> {
        const ledger = { ...this.readLedger() };
        for (const key of ledgerKeys) {
            delete ledger[key];
        }
        await this.workspaceState.update(VsCodeDeploymentState.LEDGER_KEY, ledger);
    }

    private readLedger(): Record<string, DeployedRevision> {
        return this.workspaceState.get<Record<string, DeployedRevision>>(
            VsCodeDeploymentState.LEDGER_KEY,
            {},
        );
    }
}
