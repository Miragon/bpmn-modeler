package io.miragon.intellij.bpmn

import com.intellij.codeInsight.daemon.impl.HighlightInfo
import com.intellij.codeInsight.daemon.impl.HighlightInfoFilter
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.psi.PsiFile

/**
 * Drops the Groovy *annotator's* "Cannot resolve symbol" highlights in our inline
 * "Edit Script" tabs.
 *
 * The script lives in a classpath-less [com.intellij.testFramework.LightVirtualFile],
 * so any symbol the synthetic resolver doesn't cover (`new Date()`, `"x".trim()`, …)
 * reads as unresolved and gets greyed out. That greying comes from the highlight
 * *visitor* at exactly [HighlightSeverity.INFORMATION] (no inspection id), which
 * routes through [HighlightInfoFilter] — unlike the [ScriptInspectionSuppressor]-handled
 * inspections, which bypass filtering.
 *
 * We drop *only* INFORMATION-severity highlights on our own tabs (gated by
 * [SCRIPT_COMPLETION_KEY]). The narrower band matters: Groovy emits its *semantic*
 * highlighting (resolved methods/fields/locals colored distinctly) at
 * `SYMBOL_TYPE_SEVERITY`, whose numeric value (2) sits *below* INFORMATION (10), so
 * those colors now survive — an earlier blanket "drop everything below ERROR" threw
 * them away. Genuine parse/syntax errors are ERROR and still surface; inspection
 * warnings are handled by [ScriptInspectionSuppressor].
 */
class ScriptHighlightFilter : HighlightInfoFilter {
    /** Return false to drop a highlight. */
    override fun accept(highlightInfo: HighlightInfo, file: PsiFile?): Boolean {
        if (file == null) return true
        // originalFile fallback: the daemon often highlights an in-memory copy
        // of the file whose UserData lives on the original's VirtualFile.
        val virtualFile = file.virtualFile ?: file.originalFile?.virtualFile ?: return true
        if (virtualFile.getUserData(SCRIPT_COMPLETION_KEY) == null) return true
        // Drop the unresolved-symbol greying (INFORMATION) but keep semantic
        // colors (SYMBOL_TYPE_SEVERITY = 2, below INFORMATION) and real errors.
        return highlightInfo.severity != HighlightSeverity.INFORMATION
    }
}
