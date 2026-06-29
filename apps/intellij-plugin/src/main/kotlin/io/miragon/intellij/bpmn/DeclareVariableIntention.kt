package io.miragon.intellij.bpmn

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.psi.util.PsiTreeUtil
import org.jetbrains.plugins.groovy.lang.psi.api.statements.expressions.GrReferenceExpression

/**
 * 💡 "Declare '<name>' in variable manifest" — the IntelliJ counterpart of VS
 * Code's `ScriptDeclareVariableCodeAction`. When the caret sits on a genuinely
 * *unresolved* bare reference in one of our inline Groovy script tabs, this
 * offers to scaffold a `*.bpmn.vars.json` entry for it; the core writes the
 * file, reveals it (via `notifier/openDocument`), and the manifest watcher
 * re-pushes completion so the variable appears live as an `authored` entry.
 *
 * Unlike VS Code's lexical heuristic this uses real Groovy PSI, so detection is
 * precise: [ScriptBindingMembersContributor] resolves every in-scope bean *and*
 * known process variable as a synthetic binding, so a reference that resolves to
 * `null` is exactly one the model doesn't know. Scoped to Groovy via the
 * `<language>` of its `<intentionAction>` registration and to our own tabs via
 * [SCRIPT_COMPLETION_KEY].
 */
class DeclareVariableIntention : IntentionAction {
    // Computed in isAvailable and read by getText on the same EDT pass — the
    // conventional way an IntentionAction surfaces the concrete name in its label.
    private var variableName: String? = null

    override fun getFamilyName(): String = "Declare variable in manifest"

    override fun getText(): String =
        variableName?.let { "Declare '$it' in variable manifest" } ?: familyName

    // No PSI mutation — the change is an out-of-process RPC, so no write action.
    override fun startInWriteAction(): Boolean = false

    override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean {
        variableName = null
        if (editor == null || file == null) return false
        val model = file.scriptCompletionModel() ?: return false

        val name = unresolvedReferenceAt(file, editor.caretModel.offset)?.referenceName ?: return false
        // A resolved reference was already excluded; this also guards the case
        // where the synthetic binding didn't materialise for a known variable.
        if (model.variables.orEmpty().any { it.name == name }) return false

        variableName = name
        return true
    }

    override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
        if (editor == null || file == null) return
        val scriptId = file.scriptVirtualFile()?.getUserData(SCRIPT_ID_KEY) ?: return
        val name = unresolvedReferenceAt(file, editor.caretModel.offset)?.referenceName ?: return
        project.service<CoreProcess>().appendScriptVariableToManifest(scriptId, name)
    }

    /**
     * The bare, unresolved Groovy reference at [offset] (or immediately before it,
     * so a caret resting at the end of the identifier still matches), or null.
     * Only *unqualified* references qualify: a process variable is a top-level
     * name, not `obj.member`, and an in-scope bean/variable would resolve and be
     * skipped.
     */
    private fun unresolvedReferenceAt(file: PsiFile, offset: Int): GrReferenceExpression? {
        val reference = referenceAt(file, offset) ?: referenceAt(file, (offset - 1).coerceAtLeast(0))
        if (reference == null || reference.qualifierExpression != null) return null
        return if (reference.resolve() == null) reference else null
    }

    private fun referenceAt(file: PsiFile, offset: Int): GrReferenceExpression? =
        PsiTreeUtil.getParentOfType(
            file.findElementAt(offset),
            GrReferenceExpression::class.java,
            false,
        )

    /** The completion catalog for this tab, or null if it isn't one of our script tabs. */
    private fun PsiFile.scriptCompletionModel(): ScriptCompletionModel? =
        scriptVirtualFile()?.getUserData(SCRIPT_COMPLETION_KEY)

    // The in-memory copy IntelliJ resolves against has no virtualFile; fall back
    // to the original so the UserData lookup still finds our tab.
    private fun PsiFile.scriptVirtualFile() = virtualFile ?: originalFile.virtualFile
}
