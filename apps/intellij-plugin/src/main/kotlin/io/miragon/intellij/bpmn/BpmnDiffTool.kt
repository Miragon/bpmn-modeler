package io.miragon.intellij.bpmn

import com.intellij.diff.DiffContext
import com.intellij.diff.DiffTool
import com.intellij.diff.FrameDiffTool
import com.intellij.diff.SuppressiveDiffTool
import com.intellij.diff.contents.DiffContent
import com.intellij.diff.contents.DocumentContent
import com.intellij.diff.contents.FileContent
import com.intellij.diff.requests.ContentDiffRequest
import com.intellij.diff.requests.DiffRequest
import com.intellij.diff.tools.fragmented.UnifiedDiffTool
import com.intellij.diff.tools.simple.SimpleDiffTool

/**
 * Registers the JCEF BPMN diff viewer with IntelliJ's `DiffManager`.
 *
 * Both entry points the spike targets — VCS "Show Diff" on a `.bpmn` change and
 * "Compare Files" on two `.bpmn` files — produce a two-content
 * [ContentDiffRequest] and route it through `DiffManager`, which selects among
 * registered [DiffTool]s. So this single registration covers both paths; no
 * VCS-specific extension point is needed (those wrap or produce requests, they
 * do not replace the viewer).
 *
 * Implements [SuppressiveDiffTool] to hide the built-in text diff tools for
 * `.bpmn`, making the diagram viewer the default rather than a dropdown choice.
 */
class BpmnDiffTool : FrameDiffTool, SuppressiveDiffTool {
    override fun getName(): String = "BPMN Diagram Diff"

    /** Shows only for a 2-content request whose both sides are `.bpmn`. */
    override fun canShow(context: DiffContext, request: DiffRequest): Boolean {
        if (request !is ContentDiffRequest) {
            return false
        }
        val contents = request.contents
        return contents.size == 2 && contents.all { isBpmn(it) }
    }

    override fun createComponent(context: DiffContext, request: DiffRequest): FrameDiffTool.DiffViewer =
        BpmnDiffViewer(request as ContentDiffRequest)

    override fun getSuppressedTools(): List<Class<out DiffTool>> =
        listOf(SimpleDiffTool::class.java, UnifiedDiffTool::class.java)

    /**
     * `.bpmn` detection by filename. The content type is unreliable here — BPMN
     * has no registered IntelliJ file type, so it resolves to XML/unknown — but
     * both VCS contents carry a `highlightFile` (the working-tree file) and
     * Compare Files contents carry their `file`, so the name is the firm signal.
     */
    private fun isBpmn(content: DiffContent): Boolean {
        val name =
            when (content) {
                is FileContent -> content.file.name
                is DocumentContent -> content.highlightFile?.name
                else -> null
            } ?: return false
        return name.endsWith(".bpmn", ignoreCase = true) ||
            name.endsWith(".bpmn20.xml", ignoreCase = true)
    }
}
