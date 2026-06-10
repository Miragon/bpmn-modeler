package io.miragon.intellij.bpmn

import com.intellij.psi.JavaPsiFacade
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementFactory
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiSubstitutor
import com.intellij.psi.PsiType
import com.intellij.psi.ResolveState
import com.intellij.psi.impl.light.LightPsiClassBuilder
import com.intellij.psi.scope.PsiScopeProcessor
import com.intellij.psi.search.GlobalSearchScope
import org.jetbrains.plugins.groovy.lang.psi.GroovyFile
import org.jetbrains.plugins.groovy.lang.psi.impl.synthetic.GrLightMethodBuilder
import org.jetbrains.plugins.groovy.lang.psi.impl.synthetic.GrLightVariable
import org.jetbrains.plugins.groovy.lang.psi.impl.synthetic.GroovyScriptClass
import org.jetbrains.plugins.groovy.lang.resolve.NonCodeMembersContributor

/**
 * Makes the Camunda script bindings (`execution`, `task`, `eventName`, …)
 * genuinely *resolve* inside a Groovy "Edit Script" tab.
 *
 * The bindings are injected at runtime by Camunda's JSR-223 engine, so the
 * Groovy PSI never sees them — and its type-check inspection
 * (`GroovyTypeCheckVisitor`) then flags a bare `execution` as an unresolved
 * implicit method call, and `execution.getVariable(…)` as an unresolved member.
 * Highlight-filter EPs only gate the *old* "Cannot resolve symbol" checker, not
 * this one, so the only correct fix is to make the references resolve for real:
 * we contribute each in-scope bean as a [GrLightVariable] whose *type* is a
 * synthetic class carrying the bean's catalog methods. Then `execution` resolves
 * to a variable (clearing the method-call warning) and `execution.getVariable(…)`
 * resolves off that variable's class (clearing the member warning).
 *
 * The light variable carries its type at construction: the binding-specific
 * `GrBindingVariable.setType` is an unimplemented stub that throws
 * `UnsupportedOperationException` at runtime (it infers its type from in-file
 * assignments, of which a binding has none), so [GrLightVariable] — which stores
 * the type passed to its constructor — is the correct synthetic to use here.
 *
 * The catalog is single-sourced: it originates in core, ships over the bridge
 * with `script/open`, and is attached to the script tab as [SCRIPT_COMPLETION_KEY]
 * UserData. This class only *renders* that opaque, pre-scoped data as PSI — it
 * holds no BPMN/Camunda knowledge of its own. Scope is Groovy-only by design
 * (the surface the user reported); JS/other engines resolve differently.
 */
class ScriptBindingMembersContributor : NonCodeMembersContributor() {
    override fun processDynamicElements(
        qualifierType: PsiType,
        aClass: PsiClass?,
        processor: PsiScopeProcessor,
        place: PsiElement,
        state: ResolveState,
    ) {
        // Gate twice: the qualifier must be *this* script's class, and that
        // script file must carry our UserData — so we never leak bindings into
        // unrelated Groovy files or onto unrelated qualifiers.
        val scriptClass = aClass as? GroovyScriptClass ?: return
        val groovyFile = scriptClass.containingFile as? GroovyFile ?: return
        val model = completionModelFor(groovyFile) ?: return

        val project = groovyFile.project
        val elementFactory = JavaPsiFacade.getElementFactory(project)
        val psiManager = groovyFile.manager
        val resolveScope = place.resolveScope

        for (bean in model.beans) {
            val type = beanType(bean, groovyFile, elementFactory, psiManager, resolveScope)
            // navigationElement = groovyFile: Ctrl-click on the binding lands on
            // the script itself, since it has no real declaration site.
            val bindingVariable = GrLightVariable(psiManager, bean.name, type, groovyFile)
            // execute() returns false to stop the scan early (e.g. the resolver
            // already found the single name it was looking for).
            if (!processor.execute(bindingVariable, state)) return
        }
    }

    /**
     * The [ScriptCompletionModel] attached to [groovyFile]'s tab, or null if this
     * isn't one of our script tabs. During resolution the PSI file's own
     * [com.intellij.openapi.vfs.VirtualFile] is the tracked `LightVirtualFile`;
     * the `originalFile` fallback covers the in-memory copy IntelliJ resolves
     * against while completing.
     */
    private fun completionModelFor(groovyFile: GroovyFile): ScriptCompletionModel? {
        groovyFile.virtualFile?.getUserData(SCRIPT_COMPLETION_KEY)?.let { return it }
        return groovyFile.originalFile.virtualFile?.getUserData(SCRIPT_COMPLETION_KEY)
    }

    /**
     * The PSI type to give a binding variable.
     *
     * Object beans (with [BeanInfo.methods]) get a synthetic [LightPsiClassBuilder]
     * named after the bean's type, carrying one method per catalog entry — method
     * *existence* on the class is what clears the member-call type check; the
     * param/return labels need not resolve to real classes. Value beans (no
     * methods, e.g. `eventName: String`) just resolve their declared type by name;
     * the binding variable still resolves even if the label can't be found, which
     * is all the bare-reference warning requires.
     */
    private fun beanType(
        bean: BeanInfo,
        groovyFile: GroovyFile,
        elementFactory: PsiElementFactory,
        psiManager: PsiManager,
        resolveScope: GlobalSearchScope,
    ): PsiType {
        if (bean.methods.isEmpty()) {
            return elementFactory.createTypeByFQClassName(bean.type, resolveScope)
        }

        val beanClass = LightPsiClassBuilder(groovyFile, bean.type)
        for (method in bean.methods) {
            val methodBuilder =
                GrLightMethodBuilder(psiManager, method.name)
                    .apply {
                        addModifier("public")
                        setContainingClass(beanClass)
                        setReturnType(method.returnType, resolveScope)
                    }
            for (param in method.params) {
                methodBuilder.addParameter(param.name, param.type)
            }
            beanClass.addMethod(methodBuilder)
        }
        return elementFactory.createType(beanClass, PsiSubstitutor.EMPTY)
    }
}
