package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * One open BPMN editor as the host tracks it.
 *
 * [editorId] is the [VirtualFile.getUrl] (e.g. `file:///path`) — the same
 * scheme-qualified key the core's `EditorSessionStore` uses, so core→host
 * messages route back to the correct editor when several are open at once.
 * [postToWebview] pushes a complete JSON message into this editor's JCEF browser.
 */
class CoreSession(
    val editorId: String,
    val file: VirtualFile,
    val project: Project,
    val postToWebview: (String) -> Unit,
)
