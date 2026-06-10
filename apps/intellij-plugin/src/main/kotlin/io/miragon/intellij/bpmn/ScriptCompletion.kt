package io.miragon.intellij.bpmn

import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile

/**
 * Host-side mirror of the `completion` payload the bridge ships with
 * `script/open`, plus the plumbing that lets [ScriptCompletionContributor] find
 * it again.
 *
 * The catalog is *not* authored here: `libs/modeler-core/.../scriptApi.ts` stays
 * the single source of truth. The bridge resolves the kind-scoped beans/methods
 * and serialises them into these Gson-friendly shapes, so the host carries no
 * BPMN/Camunda knowledge — only the rendering of an opaque, pre-scoped catalog.
 */

/** Root of the `script/open.completion` payload: the beans in scope for this script's kind. */
data class ScriptCompletionModel(val beans: List<BeanInfo>)

/**
 * A global bean injected into the script context (e.g. `execution`). [methods]
 * is empty for value beans like `eventName: String`, which have no member
 * completion — matching `methodsForBean` on the core side.
 */
data class BeanInfo(
    val name: String,
    val type: String,
    val description: String,
    val methods: List<MethodInfo>,
)

/** A method callable on a bean's type (e.g. `execution.setVariable`). */
data class MethodInfo(
    val name: String,
    val returnType: String,
    val description: String,
    val params: List<ParamInfo>,
)

/** A single method parameter — name + Java-flavoured type label, for the signature. */
data class ParamInfo(val name: String, val type: String)

/**
 * Attaches the kind-scoped catalog to the script's [VirtualFile] so the
 * completion contributor can recover it. This UserData is also how the
 * contributor tells *our* inline-script tabs apart from any other open
 * `.js`/`.groovy` file — absence of the key means "not our tab, stay silent".
 */
val SCRIPT_COMPLETION_KEY: Key<ScriptCompletionModel> = Key.create("modeler.script.completion")

private val MEMBER_ACCESS = Regex("([A-Za-z_][A-Za-z0-9_]*)\\.\\s*$")

/**
 * Returns the bean name immediately preceding a trailing `.` on [linePrefix],
 * or null if the line doesn't end in `<identifier>.`.
 *
 * Port of `matchMemberAccess` in core's `scriptCompletion.ts`. Kind parsing is
 * deliberately *not* ported: the bridge already resolved the kind and shipped
 * only the in-scope beans.
 */
fun matchMemberAccess(linePrefix: String): String? =
    MEMBER_ACCESS.find(linePrefix)?.groupValues?.get(1)
