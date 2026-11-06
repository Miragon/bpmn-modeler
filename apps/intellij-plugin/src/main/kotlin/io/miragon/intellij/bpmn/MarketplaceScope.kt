package io.miragon.intellij.bpmn

/** The core's marketplace scopes, by their wire name. */
internal enum class MarketplaceScope(val wireName: String) {
    PROJECT("project"),
    ALL_PROJECTS("allProjects"),
    ;

    companion object {
        fun ofWireName(wireName: String): MarketplaceScope =
            entries.firstOrNull { it.wireName == wireName }
                ?: throw IllegalArgumentException("Unknown marketplace scope '$wireName'")
    }
}
