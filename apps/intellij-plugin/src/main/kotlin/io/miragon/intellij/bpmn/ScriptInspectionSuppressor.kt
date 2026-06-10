package io.miragon.intellij.bpmn

import com.intellij.codeInspection.InspectionSuppressor
import com.intellij.codeInspection.SuppressQuickFix
import com.intellij.psi.PsiElement

/**
 * Suppresses Groovy's resolution/type-check *inspections* in our inline "Edit
 * Script" tabs.
 *
 * The bindings injected at runtime (`execution`, `task`, …) have no PSI
 * declaration, so `GroovyAssignabilityCheck` reports "No candidates found for
 * method call" / "cannot be applied", and `GrUnresolvedAccess` the unresolved
 * references. These come from the inspection pass, which — unlike the annotator
 * highlights [ScriptHighlightFilter] drops — does *not* consult HighlightInfoFilter,
 * so suppressing at the inspection level is the only way to silence them. The IDE
 * cannot know a Camunda script's runtime classpath, so the analysis is pure noise
 * here (the VS Code host doesn't type-check these scripts at all). Scoped to our
 * own tabs via [SCRIPT_COMPLETION_KEY].
 */
class ScriptInspectionSuppressor : InspectionSuppressor {
    override fun isSuppressedFor(element: PsiElement, toolId: String): Boolean {
        if (toolId !in SUPPRESSED_INSPECTIONS) return false
        val file = element.containingFile ?: return false
        val virtualFile = file.virtualFile ?: file.originalFile?.virtualFile ?: return false
        return virtualFile.getUserData(SCRIPT_COMPLETION_KEY) != null
    }

    override fun getSuppressActions(element: PsiElement?, toolId: String): Array<SuppressQuickFix> =
        SuppressQuickFix.EMPTY_ARRAY

    private companion object {
        /**
         * `GroovyAssignabilityCheck` emits "cannot be applied" / "no candidates
         * found for method call"; `GrUnresolvedAccess` the unresolved-reference
         * warnings. Both target runtime symbols the static analysis can't see.
         */
        val SUPPRESSED_INSPECTIONS = setOf("GroovyAssignabilityCheck", "GrUnresolvedAccess")
    }
}
