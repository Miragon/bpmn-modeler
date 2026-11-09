package io.miragon.intellij.bpmn

/** The core's project scopes, by their wire name: the open project, or every project the user opens. */
internal enum class ProjectScope(val wireName: String) {
    PROJECT("project"),
    ALL_PROJECTS("allProjects"),
    ;

    companion object {
        fun ofWireName(wireName: String): ProjectScope =
            entries.firstOrNull { it.wireName == wireName }
                ?: throw IllegalArgumentException("Unknown project scope '$wireName'")
    }
}
