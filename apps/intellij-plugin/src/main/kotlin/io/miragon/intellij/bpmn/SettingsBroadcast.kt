package io.miragon.intellij.bpmn

import com.intellij.openapi.project.ProjectManager

/**
 * Pushes the current settings snapshot to every open project that has already
 * spawned its bridge, so an open `.bpmn` editor reacts live.
 *
 * `getServiceIfCreated` is deliberate: instantiating [CoreProcess] here would
 * spawn a bridge for a project that never opened a `.bpmn` file. Shared by the
 * settings page (Settings ▸ apply) and the app-wide marketplace add — both change
 * *every* window's merged list at once, so both must fan out to all of them, not
 * just the acting project.
 */
internal fun pushSettingsToRunningBridges() {
    for (project in ProjectManager.getInstance().openProjects) {
        if (project.isDisposed) continue
        project.getServiceIfCreated(CoreProcess::class.java)?.pushSettings()
    }
}
