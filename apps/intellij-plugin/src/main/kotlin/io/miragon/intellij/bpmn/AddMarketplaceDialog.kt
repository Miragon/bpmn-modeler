package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
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

/**
 * The add question as one form: the location, and a checkbox that stands for
 * the second of two scopes, unchecked for the first. A question without a
 * choice shows no checkbox and answers with its scope.
 */
internal class MarketplaceAddForm(private val question: MarketplaceAddQuestion) {
    var location: String = question.location
    val scopeCheckbox: MarketplaceScopeChoice? = question.scopes.takeIf { it.size == 2 }?.last()
    var scopeChecked: Boolean = scopeCheckbox?.scope == question.scope

    fun answer(): MarketplaceAddAnswer =
        MarketplaceAddAnswer(
            location,
            when {
                scopeCheckbox == null -> question.scope
                scopeChecked -> scopeCheckbox.scope
                else -> question.scopes.first().scope
            },
        )
}

/**
 * Shows a [MarketplaceAddForm] built with the Kotlin UI DSL, which can host the
 * checkbox a bare `Messages.showInputDialog` cannot. It checks nothing: the
 * core checks the location after OK and asks again with why it refused it.
 */
internal class AddMarketplaceDialog(project: Project, private val question: MarketplaceAddQuestion) :
    DialogWrapper(project) {
    private val form = MarketplaceAddForm(question)
    private lateinit var locationField: JBTextField

    init {
        title = question.title
        init()
        question.invalidLocation?.let { setErrorText(it, locationField) }
    }

    override fun createCenterPanel(): JComponent =
        panel {
            row {
                locationField =
                    textField()
                        .align(AlignX.FILL)
                        .bindText(form::location)
                        .comment(StringUtil.escapeXmlEntities(question.prompt))
                        .focused()
                        .applyToComponent { emptyText.setText(question.placeholder) }
                        .component
            }
            form.scopeCheckbox?.let { choice ->
                row {
                    checkBox(choice.label)
                        .bindSelected(form::scopeChecked)
                        .comment(StringUtil.escapeXmlEntities(choice.description))
                }
            }
        }

    /** The answer as entered, or null when the user cancelled. */
    fun ask(): MarketplaceAddAnswer? = if (showAndGet()) form.answer() else null
}
