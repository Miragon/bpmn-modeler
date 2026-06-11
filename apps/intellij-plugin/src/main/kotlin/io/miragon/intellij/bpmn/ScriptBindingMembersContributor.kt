package io.miragon.intellij.bpmn

import com.intellij.psi.CommonClassNames
import com.intellij.psi.JavaPsiFacade
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementFactory
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiSubstitutor
import com.intellij.psi.PsiType
import com.intellij.psi.ResolveState
import com.intellij.psi.impl.light.LightPsiClassBuilder
import com.intellij.psi.scope.ElementClassHint
import com.intellij.psi.scope.PsiScopeProcessor
import com.intellij.psi.search.GlobalSearchScope
import org.jetbrains.plugins.groovy.lang.psi.GroovyFile
import org.jetbrains.plugins.groovy.lang.psi.impl.synthetic.GrLightMethodBuilder
import org.jetbrains.plugins.groovy.lang.psi.impl.synthetic.GrLightVariable
import org.jetbrains.plugins.groovy.lang.psi.impl.synthetic.GroovyScriptClass
import org.jetbrains.plugins.groovy.lang.resolve.NonCodeMembersContributor
import org.jetbrains.plugins.groovy.lang.resolve.ResolveUtil

/**
 * Makes the symbols available at runtime in a Groovy "Edit Script" tab actually
 * *resolve*, so the IDE stops reporting them as unknown.
 *
 * The script lives in a classpath-less [com.intellij.testFramework.LightVirtualFile]
 * with no Groovy SDK and no Camunda jars, so the Camunda bindings (`execution`,
 * `task`, `eventName`) and standard `Script` methods (`println`, `print`) are all
 * unresolved. An unresolved reference makes Groovy's quick-doc show "No candidates
 * found for method call …" on hover — which no highlight filter or inspection
 * suppressor can remove, because it comes from the *documentation* provider. The
 * only fix is genuine resolution, which we provide here as synthetic PSI:
 *
 * - **Bindings** (property/variable references): each in-scope bean becomes a
 *   [GrLightVariable] whose type is a synthetic class carrying the catalog
 *   methods, so `execution` and `execution.getVariable(…)` both resolve.
 * - **Script methods** (unqualified method calls): the common `Script`/Groovy
 *   helpers ([SCRIPT_METHODS]) are contributed onto the script class, so
 *   `println`/`print` resolve. The IDE bundles no Groovy SDK to resolve them
 *   against, so we synthesise the handful that scripts actually use; richer
 *   stdlib coverage would require bundling the Groovy runtime.
 *
 * The catalog originates in core and arrives over the bridge as
 * [SCRIPT_COMPLETION_KEY] UserData; this only renders it as PSI, scoped to our own
 * tabs. Greying/applicability *highlights* on anything still unresolved are
 * handled separately by [ScriptHighlightFilter] / [ScriptInspectionSuppressor].
 */
class ScriptBindingMembersContributor : NonCodeMembersContributor() {
    override fun processDynamicElements(
        qualifierType: PsiType,
        aClass: PsiClass?,
        processor: PsiScopeProcessor,
        place: PsiElement,
        state: ResolveState,
    ) {
        // Gate: the qualifier must be *this* script's class, and the script file
        // must carry our UserData — never leak into unrelated Groovy files.
        val scriptClass = aClass as? GroovyScriptClass ?: return
        val groovyFile = scriptClass.containingFile as? GroovyFile ?: return
        val model = completionModelFor(groovyFile) ?: return

        val elementFactory = JavaPsiFacade.getElementFactory(groovyFile.project)
        val psiManager = groovyFile.manager
        val resolveScope = place.resolveScope
        val classHint = processor.getHint(ElementClassHint.KEY)

        // A processor resolving a variable/property reference (e.g. bare
        // `execution`, or the `execution` qualifier of `execution.getVariable`).
        if (ResolveUtil.shouldProcessProperties(classHint)) {
            for (bean in model.beans) {
                val type = beanType(bean, groovyFile, elementFactory, psiManager, resolveScope)
                // navigationElement = groovyFile: the binding has no real
                // declaration site, so Ctrl-click lands on the script itself.
                val binding = GrLightVariable(psiManager, bean.name, type, groovyFile)
                if (!processor.execute(binding, state)) return
            }

            // Process variables resolve as untyped Object bindings: enough to stop
            // Groovy flagging a completed variable name as unresolved, without
            // claiming member knowledge we don't have yet (typed bindings are a
            // later phase). Bean names already contributed above take precedence.
            val beanNames = model.beans.map { it.name }.toSet()
            val objectType =
                elementFactory.createTypeByFQClassName(
                    CommonClassNames.JAVA_LANG_OBJECT,
                    resolveScope,
                )
            for (variable in model.variables.orEmpty()) {
                if (variable.name in beanNames) continue
                val binding = GrLightVariable(psiManager, variable.name, objectType, groovyFile)
                if (!processor.execute(binding, state)) return
            }
        }

        // A processor resolving an unqualified method call (e.g. `println hello`).
        if (ResolveUtil.shouldProcessMethods(classHint)) {
            for (scriptMethod in SCRIPT_METHODS) {
                val method =
                    GrLightMethodBuilder(psiManager, scriptMethod.name).apply {
                        addModifier("public")
                        setContainingClass(scriptClass)
                        setReturnType(scriptMethod.returnType, resolveScope)
                        scriptMethod.paramNames.forEach { addParameter(it, CommonClassNames.JAVA_LANG_OBJECT) }
                    }
                if (!processor.execute(method, state)) return
            }
        }
    }

    /**
     * The [ScriptCompletionModel] attached to [groovyFile]'s tab, or null if this
     * isn't one of our script tabs. The `originalFile` fallback covers the
     * in-memory copy IntelliJ resolves against while completing.
     */
    private fun completionModelFor(groovyFile: GroovyFile): ScriptCompletionModel? {
        groovyFile.virtualFile?.getUserData(SCRIPT_COMPLETION_KEY)?.let { return it }
        return groovyFile.originalFile.virtualFile?.getUserData(SCRIPT_COMPLETION_KEY)
    }

    /**
     * The PSI type for a binding variable. Object beans get a synthetic class
     * carrying their catalog methods (so member calls resolve); value beans
     * (`eventName: String`) resolve their declared type by name. Params are typed
     * [CommonClassNames.JAVA_LANG_OBJECT] — the catalog's bare labels ("String")
     * don't resolve in this classpath-less file, which would make every call read
     * as "cannot be applied"; Object accepts any argument and the readable
     * signature is shown by [ScriptCompletionContributor].
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
                GrLightMethodBuilder(psiManager, method.name).apply {
                    addModifier("public")
                    setContainingClass(beanClass)
                    setReturnType(method.returnType, resolveScope)
                    method.params.forEach { addParameter(it.name, CommonClassNames.JAVA_LANG_OBJECT) }
                }
            beanClass.addMethod(methodBuilder)
        }
        return elementFactory.createType(beanClass, PsiSubstitutor.EMPTY)
    }

    /** Name + return type + parameter names of a synthesised script method. */
    private data class ScriptMethod(
        val name: String,
        val returnType: String,
        val paramNames: List<String>,
    )

    private companion object {
        /**
         * The Groovy `Script`/`DefaultGroovyMethods` helpers scripts use most. The
         * IDE bundles no Groovy SDK to resolve these against, so we synthesise them
         * to clear the "No candidates" quick-doc on `println`/`print`.
         */
        val SCRIPT_METHODS = listOf(
            ScriptMethod("println", CommonClassNames.JAVA_LANG_VOID, listOf("value")),
            ScriptMethod("println", CommonClassNames.JAVA_LANG_VOID, emptyList()),
            ScriptMethod("print", CommonClassNames.JAVA_LANG_VOID, listOf("value")),
        )
    }
}
