package io.miragon.intellij.bpmn

/** The core's `ActionNoticeTone`; `ActionNoticeToneTest` holds it to `ACTION_NOTICE_TONES`. */
enum class ActionNoticeTone(override val wireName: String) : WireValue {
    INFO("info"),
    WARNING("warning"),
}
