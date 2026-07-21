package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Which modeler a [CoreSession] drives. [wire] is the discriminator the bridge's
 * `session/register` reads to route the session to the BPMN or DMN service (see
 * the bridge `RegisterParams.kind`); an older bridge that predates DMN treats an
 * absent value as BPMN, so the wire strings must stay stable.
 */
enum class ModelerKind(val wire: String) {
    BPMN("bpmn"),
    DMN("dmn"),
}

/**
 * One open modeler editor as the host tracks it.
 *
 * [editorId] is the [VirtualFile.getUrl] (e.g. `file:///path`) — the same
 * scheme-qualified key the core's `EditorSessionStore` uses, so core→host
 * messages route back to the correct editor when several are open at once.
 * [kind] tells the bridge which modeler (BPMN/DMN) owns this session, so a `.dmn`
 * tab renders through the DMN service instead of the BPMN one.
 * [postToWebview] pushes a complete JSON message into this editor's JCEF browser.
 */
class CoreSession(
    val editorId: String,
    val file: VirtualFile,
    val project: Project,
    val kind: ModelerKind = ModelerKind.BPMN,
    val postToWebview: (String) -> Unit,
)
