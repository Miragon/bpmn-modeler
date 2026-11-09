package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.ProjectManager

/**
 * Pushes the current settings snapshot to every open project that has already
 * spawned its bridge, so an open `.bpmn` editor reacts live.
 *
 * `getServiceIfCreated` is deliberate: instantiating [CoreProcess] here would
 * spawn a bridge for a project that never opened a `.bpmn` file. Shared by the
 * settings page (Settings ▸ apply) and the app-wide marketplace add — both change
 * *every* window's merged list at once, so both must fan out to all of them, not
 * just the acting project. The element template previews run without a bridge,
 * so they hear the change on [ModelerSettingsListener.TOPIC].
 */
internal fun pushSettingsToRunningBridges() {
    for (project in ProjectManager.getInstance().openProjects) {
        if (project.isDisposed) continue
        project.getServiceIfCreated(CoreProcess::class.java)?.pushSettings()
    }
    ApplicationManager.getApplication().messageBus.syncPublisher(ModelerSettingsListener.TOPIC).settingsChanged()
}

/** Mirrors the stored plugin approvals into every bridge that runs, as [pushSettingsToRunningBridges] does the settings. */
internal fun pushPluginApprovalsToRunningBridges(snapshot: PluginApprovalSnapshot) {
    for (project in ProjectManager.getInstance().openProjects) {
        if (project.isDisposed) continue
        project.getServiceIfCreated(CoreProcess::class.java)?.pushPluginApprovals(snapshot)
    }
}

/**
 * Mirrors the stored template switches into every bridge that runs, after an
 * all-projects change; each bridge gets its own project's switches with them.
 */
internal fun pushTemplatePreferencesToRunningBridges() {
    for (project in ProjectManager.getInstance().openProjects) {
        if (project.isDisposed) continue
        project.getServiceIfCreated(CoreProcess::class.java)?.pushTemplatePreferences()
    }
}
