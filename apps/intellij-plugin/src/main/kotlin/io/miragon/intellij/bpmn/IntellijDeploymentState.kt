package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

/**
 * Project-scoped persistence for the non-secret deployment-form state (endpoint,
 * tenant, auth type, OAuth2 token endpoint + audience), the IntelliJ counterpart
 * of VS Code's `VsCodeDeploymentState` (which uses `workspaceState`, i.e.
 * per-project — matched here by the *project*-scoped [PropertiesComponent]).
 *
 * Keys mirror the VS Code constants 1:1 so the persisted shape stays comparable
 * across hosts. The snapshot crosses the RPC boundary as the bridge's
 * `deploymentState/seed` param; setters back the `deploymentState/save*` handlers.
 * Secrets are out of scope — they live in [IntellijSecretStore] / PasswordSafe.
 */
@Service(Service.Level.PROJECT)
class IntellijDeploymentState(private val project: Project) {
    private val props get() = PropertiesComponent.getInstance(project)

    /** The snapshot shaped exactly as the bridge's `DeploymentStateSnapshot` seed param. */
    fun snapshotMap(): Map<String, Any> =
        linkedMapOf(
            "endpoint" to props.getValue(ENDPOINT, ""),
            "tenantId" to props.getValue(TENANT_ID, ""),
            "authType" to props.getValue(AUTH_TYPE, "none"),
            "tokenEndpoint" to props.getValue(TOKEN_ENDPOINT, ""),
            "audience" to props.getValue(AUDIENCE, ""),
        )

    fun saveAuthType(authType: String) = props.setValue(AUTH_TYPE, authType, "none")

    fun saveOAuth2Config(tokenEndpoint: String, audience: String) {
        props.setValue(TOKEN_ENDPOINT, tokenEndpoint, "")
        props.setValue(AUDIENCE, audience, "")
    }

    fun save(endpoint: String, tenantId: String) {
        props.setValue(ENDPOINT, endpoint, "")
        props.setValue(TENANT_ID, tenantId, "")
    }

    companion object {
        fun getInstance(project: Project): IntellijDeploymentState =
            project.getService(IntellijDeploymentState::class.java)

        // Mirror the VS Code `bpmn-modeler.deployment.*` workspaceState keys.
        private const val ENDPOINT = "bpmn-modeler.deployment.endpoint"
        private const val TENANT_ID = "bpmn-modeler.deployment.tenantId"
        private const val AUTH_TYPE = "bpmn-modeler.deployment.authType"
        private const val TOKEN_ENDPOINT = "bpmn-modeler.deployment.tokenEndpoint"
        private const val AUDIENCE = "bpmn-modeler.deployment.audience"
    }
}
