package io.miragon.intellij.bpmn

import com.intellij.lang.Language
import com.intellij.lang.documentation.AbstractDocumentationProvider
import com.intellij.lang.documentation.DocumentationMarkup
import com.intellij.openapi.util.text.StringUtil
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiManager
import com.intellij.psi.impl.FakePsiElement

/**
 * Populates the quick-doc (Ctrl-Q) / documentation pane for the inline
 * "Edit Script" completions [ScriptCompletionContributor] contributes.
 *
 * The contributor's lookups are plain [com.intellij.codeInsight.lookup.LookupElementBuilder]s,
 * so without a [com.intellij.lang.documentation.DocumentationProvider] the side
 * pane shows "No documentation found" even though the catalog carries a rich
 * description. We bridge that gap here: the lookups now seed `getObject()` with
 * the originating [VariableInfo]/[BeanInfo]/[MethodInfo], and this provider reads
 * it back to render the description.
 *
 * Registered as the **application-level, language-agnostic** `documentationProvider`
 * EP (not `lang.documentationProvider`): a modeler script tab is frequently
 * PLAIN_TEXT (no JS/Groovy plugin), and a per-language provider would never fire
 * for it. The render is pure — it touches no index, bridge, or network — so it is
 * safe on the read-action/background thread the platform calls it from.
 */
class ScriptDocumentationProvider : AbstractDocumentationProvider() {

    /**
     * Wraps the catalog entry the user is completing into a throwaway PSI element
     * the platform can hand back to [generateDoc]. Returns null for any lookup
     * that isn't ours, so unrelated completions fall through to other providers.
     */
    override fun getDocumentationElementForLookupItem(
        psiManager: PsiManager,
        obj: Any?,
        element: PsiElement?,
    ): PsiElement? =
        when (obj) {
            is VariableInfo, is BeanInfo, is MethodInfo -> ScriptInfoElement(psiManager, obj)
            else -> null
        }

    /** Renders the catalog entry carried by our [ScriptInfoElement] as quick-doc HTML. */
    override fun generateDoc(element: PsiElement?, originalElement: PsiElement?): String? =
        when (val info = (element as? ScriptInfoElement)?.info) {
            is VariableInfo -> renderVariable(info)
            is BeanInfo -> renderBean(info)
            is MethodInfo -> renderMethod(info)
            else -> null
        }

    private fun renderVariable(variable: VariableInfo): String =
        buildDoc(
            definition = "${variable.name}: ${variable.typeHint ?: "process variable"}",
            // An authored manifest entry leads with its description; a heuristic
            // entry has only its origin, which is still the most useful thing to show.
            content = variable.description ?: variable.origin,
        )

    private fun renderBean(bean: BeanInfo): String =
        buildDoc(definition = "${bean.name}: ${bean.type}", content = bean.description)

    private fun renderMethod(method: MethodInfo): String =
        buildDoc(
            definition = "${method.name}${signatureOf(method)}: ${method.returnType}",
            content = method.description,
        )

    private fun signatureOf(method: MethodInfo): String =
        method.params.joinToString(", ", "(", ")") { "${it.name}: ${it.type}" }

    /**
     * Assembles the standard quick-doc layout: a code-styled definition header and
     * an optional description body, both HTML-escaped since the catalog text is
     * arbitrary user-authored content.
     */
    private fun buildDoc(definition: String, content: String?): String =
        buildString {
            append(DocumentationMarkup.DEFINITION_START)
            append(StringUtil.escapeXmlEntities(definition))
            append(DocumentationMarkup.DEFINITION_END)
            if (!content.isNullOrBlank()) {
                append(DocumentationMarkup.CONTENT_START)
                append(StringUtil.escapeXmlEntities(content))
                append(DocumentationMarkup.CONTENT_END)
            }
        }

    /**
     * A non-physical PSI element that exists only to ferry a catalog entry from
     * [getDocumentationElementForLookupItem] to [generateDoc]. It has no real
     * declaration site, so [getParent] is null; [getManager] returns the manager
     * the platform handed us so any incidental platform call stays valid.
     */
    private class ScriptInfoElement(
        private val psiManager: PsiManager,
        val info: Any,
    ) : FakePsiElement() {
        override fun getParent(): PsiElement? = null

        override fun getManager(): PsiManager = psiManager

        override fun getLanguage(): Language = Language.ANY
    }
}
