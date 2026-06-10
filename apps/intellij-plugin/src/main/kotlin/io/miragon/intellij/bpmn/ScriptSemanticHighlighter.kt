package io.miragon.intellij.bpmn

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiField
import com.intellij.psi.PsiMethod
import com.intellij.psi.PsiModifier
import com.intellij.psi.PsiVariable
import org.jetbrains.plugins.groovy.highlighter.GroovySyntaxHighlighter
import org.jetbrains.plugins.groovy.lang.psi.api.statements.expressions.GrReferenceExpression
import org.jetbrains.plugins.groovy.lang.psi.impl.synthetic.GrLightVariable

/**
 * Restores *semantic* colouring (resolved fields/methods/locals tinted per the
 * editor scheme) in our inline "Edit Script" tabs.
 *
 * Groovy's own semantic-highlight pass ([org.jetbrains.plugins.groovy.annotator.GrReferenceHighlighter])
 * never runs here: its `shouldHighlight` gate requires the file to be a project
 * source file, a scratch file, or a recognised script type, and our tab is a bare
 * in-memory [com.intellij.testFramework.LightVirtualFile] — none of those. So the
 * bindings and method calls render in the default foreground, with only lexer
 * colours (keywords/strings/numbers) showing. This annotator fills that gap by
 * resolving each reference and applying the matching [GroovySyntaxHighlighter]
 * colour key itself.
 *
 * Only symbols that actually resolve are tinted — the Camunda bindings and
 * synthesised script methods supplied by [ScriptBindingMembersContributor]. The
 * Camunda bindings (`execution`, `task`, …) are coloured as fields so they visibly
 * stand out as the script's injected context. Symbols with no classpath here
 * (`new Date()`, arbitrary stdlib) resolve to nothing and are simply left at their
 * lexer colour — never greyed, since [ScriptHighlightFilter] drops that.
 *
 * Uses [HighlightSeverity.TEXT_ATTRIBUTES] (the canonical "apply these colours,
 * report nothing" severity), which sits above INFORMATION and so survives
 * [ScriptHighlightFilter]'s drop of the unresolved-symbol greying. Scoped to our
 * own tabs via [SCRIPT_COMPLETION_KEY].
 */
class ScriptSemanticHighlighter : Annotator {
    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        if (element !is GrReferenceExpression) return

        val file = element.containingFile ?: return
        val virtualFile = file.virtualFile ?: file.originalFile?.virtualFile ?: return
        if (virtualFile.getUserData(SCRIPT_COMPLETION_KEY) == null) return

        // Colour the identifier token only, not the whole qualified expression —
        // the qualifier is its own GrReferenceExpression and is visited separately.
        val nameElement = element.referenceNameElement ?: return
        val colorKey = colorKeyFor(element.resolve() ?: return) ?: return

        holder.newSilentAnnotation(HighlightSeverity.TEXT_ATTRIBUTES)
            .range(nameElement)
            .textAttributes(colorKey)
            .create()
    }

    /**
     * The scheme colour key for a resolved target, or null to leave it untinted.
     * [GrLightVariable] is checked before [PsiVariable]: our bindings are light
     * variables, but we colour them as fields so they read as injected context
     * rather than ordinary locals.
     */
    private fun colorKeyFor(resolved: PsiElement): TextAttributesKey? = when (resolved) {
        is PsiMethod ->
            if (resolved.hasModifierProperty(PsiModifier.STATIC)) {
                GroovySyntaxHighlighter.STATIC_METHOD_ACCESS
            } else {
                GroovySyntaxHighlighter.METHOD_CALL
            }

        is GrLightVariable -> GroovySyntaxHighlighter.INSTANCE_FIELD

        is PsiField ->
            if (resolved.hasModifierProperty(PsiModifier.STATIC)) {
                GroovySyntaxHighlighter.STATIC_FIELD
            } else {
                GroovySyntaxHighlighter.INSTANCE_FIELD
            }

        is PsiVariable -> GroovySyntaxHighlighter.LOCAL_VARIABLE

        else -> null
    }
}
