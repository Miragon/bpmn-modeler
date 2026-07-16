package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Change Modeler Language — picks a UI locale for the modeler and applies
 * it live to every open editor. The IntelliJ counterpart of the VS Code
 * `miragon.bpmnModeler.changeLanguage` command.
 *
 * Not gated on an open editor (matching VS Code): the choice is a persisted
 * application setting, so setting it before any diagram is open is valid — an
 * editor opened later picks it up from the seeded snapshot. Live re-render rides
 * the existing `settings/didChange` broadcast, so no bridge/protocol change is
 * needed.
 */
class ChangeModelerLanguageAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val store = ModelerSettingsStore.getInstance()
        val current = store.current().language

        val items =
            ModelerLocales.CODES.mapIndexed { index, code ->
                // The greyed detail shows the raw locale code so codes that share a
                // script family (zh-Hans / zh-Hant) stay distinguishable at a glance.
                HostPicker.PickItem(index, ModelerLocales.LABELS[code] ?: code, code)
            }

        HostPicker.show(
            project,
            title = "Change Modeler Language",
            placeholder = "Select the modeler UI language",
            canPickMany = false,
            items = items,
        ) { selected ->
            val picked = selected?.firstOrNull()?.let { ModelerLocales.CODES[it] } ?: return@show
            if (picked == current) return@show
            store.update(store.current().copy(language = picked))
            // Fan the new snapshot to every open bridge so each open editor re-renders.
            pushSettingsToRunningBridges()
        }
    }
}
