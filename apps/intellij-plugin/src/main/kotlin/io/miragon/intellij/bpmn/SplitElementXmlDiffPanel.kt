package io.miragon.intellij.bpmn

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.DiffRequestPanel
import com.intellij.diff.contents.DocumentContent
import com.intellij.diff.requests.NoDiffRequest
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.IconButton
import com.intellij.ui.InplaceButton
import com.intellij.ui.JBColor
import com.intellij.ui.JBSplitter
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * A text diff of one element's XML below the diagram diff, in IntelliJ's own
 * diff viewer. Its sides carry the diagram diff's side titles, since the
 * core's title names only the element and the file.
 */
internal class SplitElementXmlDiffPanel(
    private val project: Project?,
    private val parentDisposable: Disposable,
    private val sideTitles: List<String?>,
    diagramDiff: JComponent,
    onCloseClicked: () -> Unit,
) : ElementXmlDiffPanel {
    private val splitter = JBSplitter(true, PROPORTION_KEY, DEFAULT_PROPORTION).apply { firstComponent = diagramDiff }
    private val title = JBLabel()
    private val header =
        JPanel(BorderLayout()).apply {
            border = JBUI.Borders.compound(JBUI.Borders.customLineBottom(JBColor.border()), JBUI.Borders.empty(2, 8))
            add(title, BorderLayout.CENTER)
            add(InplaceButton(IconButton("Close", AllIcons.Actions.Close, AllIcons.Actions.CloseHovered)) { onCloseClicked() }, BorderLayout.EAST)
        }

    // Built on the first show: most diagram diffs never open an XML diff.
    private val requestPanel: DiffRequestPanel by lazy {
        DiffManager.getInstance().createRequestPanel(project, parentDisposable, null)
    }
    private val xmlDiff: JComponent by lazy {
        JPanel(BorderLayout()).apply {
            add(header, BorderLayout.NORTH)
            add(requestPanel.component, BorderLayout.CENTER)
        }
    }

    val component: JComponent get() = splitter

    override fun show(content: ElementXmlDiffContent) {
        title.text = content.title
        requestPanel.setRequest(
            SimpleDiffRequest(
                content.title,
                xmlContent(content.before),
                xmlContent(content.after),
                sideTitles.getOrNull(0),
                sideTitles.getOrNull(1),
            ),
        )
        if (splitter.secondComponent == null) splitter.secondComponent = xmlDiff
    }

    override fun hide() {
        splitter.secondComponent = null
        requestPanel.setRequest(NoDiffRequest.INSTANCE)
    }

    private fun xmlContent(text: String): DocumentContent =
        DiffContentFactory.getInstance()
            .create(project, text, FileTypeManager.getInstance().getFileTypeByExtension("xml"))
            .also { it.document.setReadOnly(true) }

    private companion object {
        const val PROPORTION_KEY = "miragon.bpmnDiff.elementXml.proportion"
        const val DEFAULT_PROPORTION = 0.6f
    }
}
