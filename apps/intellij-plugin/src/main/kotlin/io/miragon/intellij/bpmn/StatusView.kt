package io.miragon.intellij.bpmn

/** A closed set of values the core sends by name; mirrors a union in the core's `statusView.ts`. */
interface WireValue {
    val wireName: String
}

/** Reads [wireName] as one of [E]'s values, or `null` when this host does not know it. */
inline fun <reified E> wireValueOf(wireName: String): E? where E : Enum<E>, E : WireValue =
    enumValues<E>().find { it.wireName == wireName }

/** The status items the core publishes. The host decides only where each slot goes. */
enum class StatusSlot(override val wireName: String) : WireValue {
    ELEMENT_TEMPLATES("elementTemplates"),
    ENGINE_VERSION("engineVersion"),
    BPMNLINT("bpmnlint"),
    DEPLOYMENT_TARGET("deploymentTarget"),
}

enum class StatusIcon(override val wireName: String) : WireValue {
    LOADING("loading"),
    CHECK("check"),
    ENGINE("engine"),
    WARNING("warning"),
    SHIELD("shield"),
    OFF("off"),
    INFO("info"),
    DOT("dot"),
}

enum class StatusTone(override val wireName: String) : WireValue {
    NEUTRAL("neutral"),
    SUCCESS("success"),
    ATTENTION("attention"),
    INFO("info"),
    WARNING("warning"),
}

enum class StatusAction(override val wireName: String) : WireValue {
    CHANGE_ENGINE_VERSION("changeEngineVersion"),
    TOGGLE_LINTING("toggleLinting"),
    DEPLOYMENT_MENU("deploymentMenu"),
}

/** What one slot shows, as the core built it; the host maps icon, tone and action onto its own UI. */
data class StatusView(
    val text: String,
    val icon: StatusIcon? = null,
    val tooltip: String? = null,
    val tone: StatusTone = StatusTone.NEUTRAL,
    val action: StatusAction? = null,
    val transient: Boolean = false,
)

/** Where the host shows the core's status slots, one view per slot. */
interface StatusSlots {
    fun show(slot: StatusSlot, view: StatusView)

    fun hide(slot: StatusSlot)
}
