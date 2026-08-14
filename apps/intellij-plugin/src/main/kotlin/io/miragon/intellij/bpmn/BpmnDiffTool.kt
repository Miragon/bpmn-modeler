package io.miragon.intellij.bpmn

import com.intellij.diff.DiffContext
import com.intellij.diff.FrameDiffTool
import com.intellij.diff.contents.DiffContent
import com.intellij.diff.contents.DocumentContent
import com.intellij.diff.contents.FileContent
import com.intellij.diff.requests.ContentDiffRequest
import com.intellij.diff.requests.DiffRequest

/**
 * Registers the JCEF BPMN diff viewer with IntelliJ's `DiffManager`.
 *
 * Both targeted entry points — VCS "Show Diff" on a `.bpmn` change and "Compare
 * Files" on two `.bpmn` files — produce a two-content [ContentDiffRequest] and
 * route it through `DiffManager`, which selects among registered `DiffTool`s. So
 * this single registration covers both paths; no VCS-specific extension point is
 * needed there (those wrap or produce requests, they do not replace the viewer).
 *
 * Registered `DiffTool`s are tried before the platform's built-in text tools, so
 * the diagram diff is the default viewer. It deliberately does **not** suppress
 * those built-ins: keeping `SimpleDiffTool`/`UnifiedDiffTool` in the diff
 * viewer-chooser lets the user switch to the raw XML text diff — the only way to
 * see changes a diagram can't surface, e.g. inside a script task's body (#1282).
 * The platform remembers the last-picked viewer per diff place.
 */
class BpmnDiffTool : FrameDiffTool {
    override fun getName(): String = "BPMN Diagram Diff"

    /**
     * Shows only for a two-content request whose **both** sides are `.bpmn`.
     *
     * Requiring both sides to be BPMN is deliberate: when a side is an
     * `EmptyContent` (file added or deleted) or binary, [isBpmn] returns false
     * and the request falls back to the text diff. Feeding an empty/non-XML side
     * into the bpmn-js viewer would throw on import — declining here is the
     * robust handling of those non-`DocumentContent` edge cases.
     */
    override fun canShow(context: DiffContext, request: DiffRequest): Boolean {
        if (request !is ContentDiffRequest) {
            return false
        }
        val contents = request.contents
        return contents.size == 2 && contents.all { isBpmn(it) }
    }

    override fun createComponent(context: DiffContext, request: DiffRequest): FrameDiffTool.DiffViewer =
        BpmnDiffViewer(context.project, request as ContentDiffRequest)

    /**
     * `.bpmn` detection by filename. The content type is unreliable here — BPMN
     * has no registered IntelliJ file type, so it resolves to XML/unknown — but
     * VCS contents carry a `highlightFile` (the working-tree file) and Compare
     * Files contents carry their `file`, so the name is the firm signal. Any
     * other content kind (empty, binary) has no name and is declined.
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
