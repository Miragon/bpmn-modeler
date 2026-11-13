package io.miragon.intellij.bpmn.bridge

import com.intellij.ide.trustedProjects.TrustedProjectsListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project

/**
 * Mirrors the IDE's trust of this project into its bridge, which runs no
 * workspace plugin or rule package while the user has not trusted it. The
 * register frame carries the trust too; this pushes it after every spawn and
 * whenever the IDE announces a trust change, so open editors reload or lint
 * again without a restart.
 */
internal class WorkspaceTrustRouter(private val deps: BridgeDeps) : ReplicatedState {
    override val kind = ReplicatedStateKind.WORKSPACE_TRUST

    fun register() {
        // Any project's change re-reads this one's: trusting a parent folder trusts the projects below it.
        ApplicationManager.getApplication().messageBus.connect(deps.parentDisposable).subscribe(
            TrustedProjectsListener.TOPIC,
            object : TrustedProjectsListener {
                override fun onProjectTrusted(project: Project) = push()

                override fun onProjectUntrusted(project: Project) = push()

                override fun onProjectTrustedFromNotification(project: Project) = push()
            },
        )
    }

    // The bridge counts the project as untrusted until told, so its first plugin request needs it.
    override fun registerSeed(): Map<String, Any?> = mapOf("workspaceTrust" to deps.projectTrust.snapshot().toParams())

    override fun push() {
        if (!deps.isProcessAlive()) return
        deps.channel.notify(
            HostToCoreMethod.WORKSPACE_TRUST_DID_CHANGE,
            deps.projectTrust.snapshot().toParams(),
            reliable = true,
        )
    }
}
