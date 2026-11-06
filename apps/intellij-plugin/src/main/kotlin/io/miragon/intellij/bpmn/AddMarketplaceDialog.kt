package io.miragon.intellij.bpmn

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.bind
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import com.intellij.util.ui.NamedColorUtil
import javax.swing.JComponent

/** The core's add question, as `marketplacePrompt/show` carries it. */
internal data class MarketplaceAddQuestion(
    val title: String,
    val prompt: String,
    val placeholder: String,
    val location: String,
    val invalidLocation: String?,
    val scopes: List<MarketplaceScopeChoice>,
    val scope: String,
)

internal data class MarketplaceScopeChoice(val scope: String, val label: String, val description: String)

internal data class MarketplaceAddAnswer(val location: String, val scope: String)

/** The answer the form edits, starting from the core's current answer. */
internal class MarketplaceAddForm(question: MarketplaceAddQuestion) {
    var location: String = question.location
    var scope: String = question.scope

    fun answer(): MarketplaceAddAnswer = MarketplaceAddAnswer(location, scope)
}

/**
 * The add question as one form: the location, why the core refused it when it
 * asks again, and one radio button per scope the core offers, with its label
 * and where it is saved. Without a choice the form answers the core's scope.
 */
internal fun marketplaceAddPanel(
    question: MarketplaceAddQuestion,
    form: MarketplaceAddForm,
): DialogPanel =
    panel {
        row {
            textField()
                .align(AlignX.FILL)
                .bindText(form::location)
                .comment(StringUtil.escapeXmlEntities(question.prompt))
                .focused()
                .applyToComponent { emptyText.setText(question.placeholder) }
        }
        question.invalidLocation?.let { refusal ->
            row {
                icon(AllIcons.General.Error).gap(RightGap.SMALL)
                text(StringUtil.escapeXmlEntities(refusal))
                    .applyToComponent { foreground = NamedColorUtil.getErrorForeground() }
            }
        }
        if (question.scopes.isNotEmpty()) {
            buttonsGroup {
                question.scopes.forEach { choice ->
                    row {
                        radioButton(choice.label, choice.scope)
                            .comment(StringUtil.escapeXmlEntities(choice.description))
                    }
                }
            }.bind(form::scope)
        }
    }

/**
 * Shows the add question built with the Kotlin UI DSL, which can host the
 * scope choice a bare `Messages.showInputDialog` cannot. It checks nothing: the
 * core checks the location after OK and asks again with why it refused it.
 */
internal class AddMarketplaceDialog(project: Project, private val question: MarketplaceAddQuestion) :
    DialogWrapper(project) {
    private val form = MarketplaceAddForm(question)

    init {
        title = question.title
        init()
    }

    override fun createCenterPanel(): JComponent = marketplaceAddPanel(question, form)

    /** The answer as entered, or null when the user cancelled. */
    fun ask(): MarketplaceAddAnswer? = if (showAndGet()) form.answer() else null
}
