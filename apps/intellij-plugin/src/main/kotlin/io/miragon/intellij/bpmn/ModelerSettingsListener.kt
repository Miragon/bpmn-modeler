package io.miragon.intellij.bpmn

import com.intellij.util.messages.Topic

/** Told after the modeler settings changed, for pages that run without a bridge. */
fun interface ModelerSettingsListener {
    fun settingsChanged()

    companion object {
        @Topic.AppLevel
        val TOPIC: Topic<ModelerSettingsListener> =
            Topic.create("Miragon modeler settings", ModelerSettingsListener::class.java)
    }
}
