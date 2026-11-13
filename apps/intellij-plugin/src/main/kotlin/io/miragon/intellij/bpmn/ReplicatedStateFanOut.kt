package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import io.miragon.intellij.bpmn.bridge.ChangeReach
import io.miragon.intellij.bpmn.bridge.ReplicatedStateKind

/**
 * Pushes the stored state of [kind] into the bridge of every project in
 * [projects] that has already spawned one, after a change of an
 * application-level store: it changes what every window's bridge mirrors.
 */
internal fun pushToRunningBridges(kind: ReplicatedStateKind, projects: List<Project> = openProjects()) {
    require(kind.reach == ChangeReach.EVERY_BRIDGE) { "$kind is mirrored only into its own project's bridge" }
    runningBridges(projects).forEach { it.pushReplicatedState(kind) }
}

/**
 * Pushes the settings to every running bridge, so an open `.bpmn` editor reacts
 * live. The element template previews run without a bridge, so they hear the
 * change on [ModelerSettingsListener.TOPIC].
 */
internal fun pushSettingsToRunningBridges() {
    pushToRunningBridges(ReplicatedStateKind.SETTINGS)
    ApplicationManager.getApplication().messageBus.syncPublisher(ModelerSettingsListener.TOPIC).settingsChanged()
}

/**
 * The bridges of [projects] that exist already. `getServiceIfCreated` is deliberate:
 * instantiating [CoreProcess] here would spawn a bridge for a project that never
 * opened a `.bpmn` file.
 */
internal fun runningBridges(projects: List<Project> = openProjects()): List<CoreProcess> =
    projects.filterNot { it.isDisposed }.mapNotNull { it.getServiceIfCreated(CoreProcess::class.java) }

private fun openProjects(): List<Project> = ProjectManager.getInstance().openProjects.asList()
