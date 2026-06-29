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

/**
 * Root of the `script/open.completion` payload: the beans in scope for this
 * script's kind, plus the process variables extracted from the model.
 *
 * [variables], [globals], and [types] **must** be nullable: Gson instantiates
 * this class via Unsafe and leaves a missing JSON member null even on a non-null
 * Kotlin type, so an open payload from an older bridge (no `globals`/`types`
 * keys) would otherwise carry a deceptive non-null default. A nullable field
 * makes the absence explicit.
 *
 * [globals] are the Camunda SPIN root functions (`S`/`JSON`); [types] maps a Java
 * type name to its callable methods, consulted when a variable carries a
 * `typeHint` (e.g. `SpinJsonNode`). Both arrive empty when the bridge's SPIN
 * setting is off — the gate lives in the bridge, so this host stays a pure
 * renderer.
 */
data class ScriptCompletionModel(
    val beans: List<BeanInfo>,
    val variables: List<VariableInfo>? = null,
    val globals: List<MethodInfo>? = null,
    val types: Map<String, List<MethodInfo>>? = null,
)

/**
 * A process variable surfaced by the model's static extraction or declared in a
 * `*.bpmn.vars.json` manifest. [origin], [typeHint], and [description] are
 * nullable for the same Gson reason as above and because the core only sets each
 * when it knows one — [description] rides along only for manifest (`authored`)
 * entries.
 */
data class VariableInfo(
    val name: String,
    val origin: String?,
    val typeHint: String?,
    val description: String?,
)

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

/**
 * The opaque `scriptId` the bridge assigned this tab, stashed on its
 * [VirtualFile] so [DeclareVariableIntention] can address the
 * `script/appendToManifest` RPC for an unknown variable. Separate from
 * [SCRIPT_COMPLETION_KEY] because the completion catalog is swapped wholesale on
 * every `updateVariables`, whereas the id is stable for the tab's lifetime.
 */
val SCRIPT_ID_KEY: Key<String> = Key.create("modeler.script.id")

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

// `getVariable("…` / `setVariableLocal('…` with an unterminated string argument
// at the end of the line — the `$` anchor scopes the match to the cursor.
private val VARIABLE_STRING_ARG =
    Regex("""((?:get|set|has|remove)Variable(?:Local)?)\s*\(\s*["']([^"'\\]*)$""")

/** The method name + partial variable name when the cursor sits inside a `getVariable("…` argument. */
data class VariableStringArg(val methodName: String, val partial: String)

/**
 * Returns the method name and partial variable name when [linePrefix] ends
 * inside the string argument of a `getVariable`/`setVariable`/… call, else null.
 *
 * Port of `matchVariableStringArg` in core's `scriptCompletion.ts`; drives the
 * host's variable-name completion mode.
 */
fun matchVariableStringArg(linePrefix: String): VariableStringArg? {
    val match = VARIABLE_STRING_ARG.find(linePrefix) ?: return null
    return VariableStringArg(match.groupValues[1], match.groupValues[2])
}
