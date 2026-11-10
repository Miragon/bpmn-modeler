package io.miragon.intellij.bpmn

import com.intellij.openapi.application.PathManager
import java.nio.file.Path

/**
 * Where the bridge copies approved workspace plugins and [WebviewServer] serves
 * them from. One folder per machine: the cache is content-addressed, so every
 * project shares it.
 */
internal object BpmnPluginCache {
    fun root(): Path = Path.of(PathManager.getSystemPath(), "miragon-bpmn-modeler", "bpmn-plugins")
}
