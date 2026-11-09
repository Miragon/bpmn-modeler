package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager

/**
 * Pushes the current settings snapshot to every open project that has already
 * spawned its bridge, so an open `.bpmn` editor reacts live.
 *
 * Shared by the settings page (Settings ▸ apply) and the app-wide marketplace
 * add — both change *every* window's merged list at once, so both must fan out
 * to all of them, not just the acting project. The element template previews
 * run without a bridge, so they hear the change on [ModelerSettingsListener.TOPIC].
 */
internal fun pushSettingsToRunningBridges() {
    runningBridges().forEach { it.pushSettings() }
    ApplicationManager.getApplication().messageBus.syncPublisher(ModelerSettingsListener.TOPIC).settingsChanged()
}

/** Mirrors the stored plugin approvals into every bridge that runs, as [pushSettingsToRunningBridges] does the settings. */
internal fun pushPluginApprovalsToRunningBridges(snapshot: PluginApprovalSnapshot) {
    runningBridges().forEach { it.pushPluginApprovals(snapshot) }
}

/**
 * Mirrors the stored template switches into every bridge that runs, after an
 * all-projects change; each bridge gets its own project's switches with them.
 */
internal fun pushTemplatePreferencesToRunningBridges() {
    runningBridges().forEach { it.pushTemplatePreferences() }
}

/**
 * The bridges of [projects] that exist already. `getServiceIfCreated` is deliberate:
 * instantiating [CoreProcess] here would spawn a bridge for a project that never
 * opened a `.bpmn` file.
 */
internal fun runningBridges(projects: List<Project> = ProjectManager.getInstance().openProjects.asList()): List<CoreProcess> =
    projects.filterNot { it.isDisposed }.mapNotNull { it.getServiceIfCreated(CoreProcess::class.java) }
