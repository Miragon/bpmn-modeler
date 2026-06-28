package io.miragon.intellij.bpmn

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionProvider
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.codeInsight.template.TemplateManager
import com.intellij.codeInsight.template.impl.ConstantNode
import com.intellij.icons.AllIcons
import com.intellij.openapi.util.TextRange
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext

/**
 * The IntelliJ counterpart of VS Code's `registerCompletionItemProvider` for
 * inline Camunda scripts. VS Code keys its provider by language id + the
 * `bpmn-script://` scheme; IntelliJ has no scheme equivalent, so this PSI-based
 * `CompletionContributor` fires for *every* file and scopes itself by checking
 * for the [SCRIPT_COMPLETION_KEY] UserData that [ScriptEditorManager] attaches to
 * our `LightVirtualFile` tabs — absence of the key means "not our script, stay
 * silent".
 *
 * The catalog itself is authored once in core and shipped with `script/open`;
 * this class only renders it, mirroring the two VS Code modes: root-level bean
 * names, and a bean's methods after a `.`.
 */
class ScriptCompletionContributor : CompletionContributor() {
    init {
        // `language="any"` in plugin.xml + this catch-all pattern means we fire
        // regardless of the script's inferred FileType (it may even be
        // PLAIN_TEXT when no JS/Python plugin is installed); the UserData check
        // below is what actually scopes us to modeler script tabs.
        extend(CompletionType.BASIC, PlatformPatterns.psiElement(), ScriptCompletionProvider())
    }

    private class ScriptCompletionProvider : CompletionProvider<CompletionParameters>() {
        override fun addCompletions(
            parameters: CompletionParameters,
            context: ProcessingContext,
            result: CompletionResultSet,
        ) {
            val model =
                parameters.originalFile.virtualFile?.getUserData(SCRIPT_COMPLETION_KEY) ?: return

            val document = parameters.editor.document
            val offset = parameters.offset
            val lineStart = document.getLineStartOffset(document.getLineNumber(offset))
            val linePrefix = document.getText(TextRange(lineStart, offset))

            // Variable mode: the cursor is inside a `getVariable("…` argument.
            // Re-anchor the prefix matcher to the partial typed since the quote
            // (IntelliJ's default prefix would be empty at a non-identifier caret).
            val variableArg = matchVariableStringArg(linePrefix)
            if (variableArg != null) {
                val prefixed = result.withPrefixMatcher(variableArg.partial)
                model.variables.orEmpty().forEach { prefixed.addElement(variableLookup(it)) }
                return
            }

            val qualifier = matchMemberAccess(linePrefix)
            if (qualifier != null) {
                // Member mode: the matched bean's methods win. Failing that, fall
                // back to the typed-variable path — resolve the qualifier's
                // `typeHint` against the shipped `types` table (e.g. a SPIN-typed
                // variable's `node.` → SpinJsonNode methods). An unknown qualifier
                // yields nothing, never the root beans.
                val beanMethods = model.beans.firstOrNull { it.name == qualifier }?.methods
                if (beanMethods != null) {
                    beanMethods.forEach { result.addElement(methodLookup(it)) }
                    return
                }
                val typeHint =
                    model.variables.orEmpty().firstOrNull { it.name == qualifier }?.typeHint
                typeHint?.let { model.types?.get(it) }
                    ?.forEach { result.addElement(methodLookup(it)) }
                return
            }

            // Root mode: in-scope bean names, then SPIN globals (`S`/`JSON`), then
            // process variables. Globals render via `methodLookup` so accepting `S`
            // inserts `S(…)` with the tab-through parameter template — the analogue
            // of VS Code's snippet. Beans win any name clash with variables,
            // matching the VS Code provider.
            model.beans.forEach { result.addElement(beanLookup(it)) }
            model.globals.orEmpty().forEach { result.addElement(methodLookup(it)) }
            val beanNames = model.beans.map { it.name }.toSet()
            model.variables.orEmpty()
                .filter { it.name !in beanNames }
                .forEach { result.addElement(variableLookup(it)) }
        }

        /** Bean as a variable-icon lookup: `name`, type on the right, description greyed. */
        private fun beanLookup(bean: BeanInfo) =
            LookupElementBuilder.create(bean.name)
                .withIcon(AllIcons.Nodes.Variable)
                .withTypeText(bean.type)
                .appendTailText("  ${bean.description}", true)

        /**
         * Process variable as a variable-icon lookup: typeHint (or a generic
         * label) right, doc greyed. An authored manifest variable leads with its
         * [VariableInfo.description]; otherwise the heuristic [VariableInfo.origin]
         * is shown.
         */
        private fun variableLookup(variable: VariableInfo) =
            LookupElementBuilder.create(variable.name)
                .withIcon(AllIcons.Nodes.Variable)
                .withTypeText(variable.typeHint ?: "process variable")
                .appendTailText(
                    (variable.description ?: variable.origin)?.let { "  $it" }.orEmpty(),
                    true,
                )

        /**
         * Method as a method-icon lookup: `name`, `(params)` tail, return type on
         * the right, description greyed. Accepting it inserts `name(…)` and starts
         * a live [com.intellij.codeInsight.template.Template] so the parameters are
         * tab-through editable — the IntelliJ analogue of VS Code's `SnippetString`
         * `${1:param}` placeholders.
         */
        private fun methodLookup(method: MethodInfo) =
            LookupElementBuilder.create(method.name)
                .withIcon(AllIcons.Nodes.Method)
                .withTailText(signatureOf(method), true)
                .withTypeText(method.returnType)
                .appendTailText("  ${method.description}", true)
                .withInsertHandler { ctx, _ ->
                    val templateManager = TemplateManager.getInstance(ctx.project)
                    val template = templateManager.createTemplate("", "")
                    // The script editor has no language reformat rules to honour
                    // (it may be PLAIN_TEXT); keep our exact `(a, b)` spacing.
                    template.setToReformat(false)
                    template.addTextSegment("(")
                    method.params.forEachIndexed { index, param ->
                        if (index > 0) template.addTextSegment(", ")
                        // ConstantNode seeds each stop with the param name as the
                        // selected placeholder text, so Tab cycles through them.
                        template.addVariable(
                            param.name,
                            ConstantNode(param.name),
                            ConstantNode(param.name),
                            true,
                        )
                    }
                    template.addTextSegment(")")
                    template.addEndVariable()
                    templateManager.startTemplate(ctx.editor, template)
                }

        private fun signatureOf(method: MethodInfo) =
            method.params.joinToString(", ", "(", ")") { "${it.name}: ${it.type}" }
    }
}
