/**
 * Pure, bpmn-js-free extraction of process-variable evidence from a moddle
 * definitions tree.
 *
 * Process variables are a *runtime* concept with no design-time declaration in
 * BPMN, so design-time IntelliSense has to assemble a best-effort model from
 * static evidence: parameter mappings, form fields, result variables,
 * call-activity mappings, and `setVariable(...)` / `${...}` occurrences inside
 * script and expression strings. We deliberately never touch XML text — only
 * the `$type`-discriminated plain objects bpmn-js hands us via
 * `getDefinitions()` — so the same code runs in the webview and against
 * object-literal fixtures in tests.
 *
 * Three confidence tiers drive how aggressively a name is surfaced. An
 * `authored` variable comes from an explicit `*.bpmn.vars.json` manifest the
 * author wrote next to the diagram and outranks everything — the manifest is
 * authoritative, so it always wins a name clash regardless of type. Below it, a
 * `declared` variable has a concrete producer (an output mapping, a result
 * variable, a form field, a `setVariable` call) and outranks a merely
 * `referenced` one (seen only inside a `${...}` read), which might be a typo or
 * a variable injected from outside the model.
 */

export type VariableConfidence = "authored" | "declared" | "referenced";

/**
 * A single process variable discovered from static model evidence or declared
 * in a `*.bpmn.vars.json` manifest.
 *
 * {@link origin} is human-facing (shown in completion docs) and names the
 * element + evidence kind so the author can trace where a suggestion came from.
 * {@link description} is the author-supplied doc carried only by `authored`
 * (manifest) entries; it is surfaced alongside the origin in completion docs.
 */
export interface VariableDef {
    readonly name: string;
    readonly origin: string;
    readonly typeHint?: string;
    readonly description?: string;
    readonly confidence: VariableConfidence;
}

/**
 * Names that look like variable references inside `${...}` but are reserved
 * Camunda/expression-language identifiers, never process variables. Filtering
 * them keeps `referenced` evidence from polluting completion with `execution`,
 * `true`, etc.
 */
const RESERVED_EXPRESSION_NAMES: ReadonlySet<string> = new Set([
    "execution",
    "task",
    "eventName",
    "true",
    "false",
    "null",
    "empty",
]);

// `setVariable("x")` / `setVariableLocal('x')` literals. Group 2 is the name;
// the back-reference \1 forces matching quote styles. A `\\`-free char class
// keeps the match to a single, un-escaped string literal.
const SET_VARIABLE_RE = /setVariable(?:Local)?\s*\(\s*(["'])([^"'\\]+)\1/g;

// `${var}` / `#{var}` — the leading identifier of a JUEL/EL expression. Only
// the first identifier is captured: `${a.b}` yields `a`, the variable in scope.
const EXPRESSION_REF_RE = /[$#]\{\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;

// `setVariable("x", S(...))` / `setVariableLocal('x', JSON(...))` — same shape
// as SET_VARIABLE_RE but the trailing `(?:S|JSON)\s*\(` guard requires the value
// arg to be a SPIN call, marking the variable as a `SpinJsonNode`. Group 2 is
// the name.
const SPIN_SET_VARIABLE_RE =
    /setVariable(?:Local)?\s*\(\s*(["'])([^"'\\]+)\1\s*,\s*(?:S|JSON)\s*\(/g;

// `x = S(...)` / `var x = JSON(...)` / `def x = S(...)` — a free identifier
// assigned a SPIN call. Group 1 is the name.
//
// The `(?<![.\w$])` lookbehind rejects `obj.x = S(...)` (field write) and
// keyword glue, capturing only a free identifier. `\s*=\s*(?:S|JSON)\s*\(`
// rejects `==`/`!=`/`>=` (a second operator char is neither whitespace nor the
// SPIN call) and `x = myParse(` / `x = foo.S(` (the SPIN call must immediately
// follow `=`).
//
// Known accepted over-approximation: `x = S(j).stringValue()` types `x` as
// `SpinJsonNode` though the terminal call returns `String`. Completion offers
// generously — a false positive costs only a glance — so we don't chase chain
// return-types here.
const SPIN_ASSIGNMENT_RE = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*=\s*(?:S|JSON)\s*\(/g;

/**
 * Returns the variable names written by `setVariable`/`setVariableLocal` string
 * literals in a script body.
 */
export function collectSetVariableNames(script: string): string[] {
    const names: string[] = [];
    for (const match of script.matchAll(SET_VARIABLE_RE)) {
        names.push(match[2]);
    }
    return names;
}

/**
 * Returns variable names whose value is a SPIN call (`S(...)`/`JSON(...)`), from
 * either `setVariable("x", S(...))` or `x = S(...)`. These resolve to the
 * `SpinJsonNode` TypeDef.
 */
export function collectSpinTypedNames(script: string): string[] {
    const names: string[] = [];
    for (const match of script.matchAll(SPIN_SET_VARIABLE_RE)) {
        names.push(match[2]);
    }
    for (const match of script.matchAll(SPIN_ASSIGNMENT_RE)) {
        names.push(match[1]);
    }
    return names;
}

/**
 * Returns the leading identifiers referenced by `${...}` / `#{...}` expressions,
 * minus reserved names.
 */
export function collectExpressionRefs(expression: string): string[] {
    const names: string[] = [];
    for (const match of expression.matchAll(EXPRESSION_REF_RE)) {
        const name = match[1];
        if (!RESERVED_EXPRESSION_NAMES.has(name)) {
            names.push(name);
        }
    }
    return names;
}

/**
 * Collapses duplicate names to one entry each, ranked by confidence tier
 * (`authored` > `declared` > `referenced`) and — among equal tier — a typed
 * entry winning over an untyped one. An `authored` manifest entry therefore
 * always wins a clash against heuristic evidence. Order of first appearance is
 * otherwise preserved so the completion list stays stable.
 */
export function dedupeVariables(vars: VariableDef[]): VariableDef[] {
    const byName = new Map<string, VariableDef>();
    for (const candidate of vars) {
        const existing = byName.get(candidate.name);
        byName.set(candidate.name, existing ? preferred(existing, candidate) : candidate);
    }
    return [...byName.values()];
}

// Higher rank wins. Listed top-down so the ordinal mirrors the doc's
// `authored` > `declared` > `referenced` precedence.
const CONFIDENCE_RANK: Record<VariableConfidence, number> = {
    authored: 2,
    declared: 1,
    referenced: 0,
};

/** Picks the stronger of two same-named variable definitions. */
function preferred(a: VariableDef, b: VariableDef): VariableDef {
    const rankA = CONFIDENCE_RANK[a.confidence];
    const rankB = CONFIDENCE_RANK[b.confidence];
    if (rankA !== rankB) {
        return rankA > rankB ? a : b;
    }
    if (a.typeHint && !b.typeHint) {
        return a;
    }
    if (b.typeHint && !a.typeHint) {
        return b;
    }
    return a;
}

/**
 * Walks every `bpmn:Process` root (recursing into sub-process `flowElements`)
 * and assembles the deduplicated process-variable model.
 *
 * Scope is process-wide for Phase 1: input-parameter names are technically
 * element-local, but per-element scoping is cheap to add later because the
 * script URI already carries the `elementId`.
 */
export function extractProcessVariables(definitions: any): VariableDef[] {
    const out: VariableDef[] = [];
    const rootElements: any[] = definitions?.rootElements ?? [];
    for (const root of rootElements) {
        if (root?.$type === "bpmn:Process") {
            collectFromFlowElements(root.flowElements ?? [], out);
        }
    }
    return dedupeVariables(out);
}

/** Recurses the flow-element tree, collecting evidence from each element. */
function collectFromFlowElements(flowElements: any[], out: VariableDef[]): void {
    for (const element of flowElements) {
        collectFromElement(element, out);
        // Sub-processes (`bpmn:SubProcess`, `bpmn:Transaction`, …) nest their
        // own flow elements; variables they produce are visible process-wide.
        if (Array.isArray(element?.flowElements)) {
            collectFromFlowElements(element.flowElements, out);
        }
    }
}

/** Collects every evidence kind carried directly on a single flow element. */
function collectFromElement(element: any, out: VariableDef[]): void {
    const label = elementLabel(element);

    // `camunda:resultVariable` on Script/Service/BusinessRule tasks.
    if (typeof element?.resultVariable === "string" && element.resultVariable) {
        out.push({
            name: element.resultVariable,
            origin: `result variable of ${label}`,
            confidence: "declared",
        });
    }

    // Inline script-task body: `setVariable(...)` literals.
    if (element?.$type === "bpmn:ScriptTask" && typeof element.script === "string") {
        for (const name of collectSetVariableNames(element.script)) {
            out.push({ name, origin: `script of ${label}`, confidence: "declared" });
        }
        // A SPIN-valued name yields a second, typed entry; `dedupeVariables`
        // keeps it over the untyped one at equal confidence, so each collector
        // stays single-purpose rather than threading type state through names.
        for (const name of collectSpinTypedNames(element.script)) {
            out.push({
                name,
                origin: `SPIN value in script of ${label}`,
                typeHint: "SpinJsonNode",
                confidence: "declared",
            });
        }
    }

    // Sequence-flow condition expression: `${var}` reads.
    const condition = element?.conditionExpression;
    if (condition && typeof condition.body === "string") {
        for (const name of collectExpressionRefs(condition.body)) {
            out.push({ name, origin: `condition on ${label}`, confidence: "referenced" });
        }
    }

    for (const extension of element?.extensionElements?.values ?? []) {
        collectFromExtension(extension, label, out);
    }
}

/** Collects evidence from one `extensionElements` child. */
function collectFromExtension(extension: any, label: string, out: VariableDef[]): void {
    switch (extension?.$type) {
        case "camunda:InputOutput": {
            for (const param of extension.inputParameters ?? []) {
                pushParameterName(param, `input mapping of ${label}`, out);
                pushParameterValueRefs(param, `input mapping of ${label}`, out);
            }
            for (const param of extension.outputParameters ?? []) {
                pushParameterName(param, `output mapping of ${label}`, out);
                pushParameterValueRefs(param, `output mapping of ${label}`, out);
            }
            break;
        }
        case "camunda:FormData": {
            for (const field of extension.fields ?? []) {
                if (typeof field?.id === "string" && field.id) {
                    out.push({
                        name: field.id,
                        origin: `form field of ${label}`,
                        typeHint: typeof field.type === "string" ? field.type : undefined,
                        confidence: "declared",
                    });
                }
            }
            break;
        }
        // `camunda:In.source` reads a variable from the *calling* process.
        case "camunda:In": {
            if (typeof extension.source === "string" && extension.source) {
                out.push({
                    name: extension.source,
                    origin: `in mapping of ${label}`,
                    confidence: "referenced",
                });
            }
            if (typeof extension.sourceExpression === "string") {
                for (const name of collectExpressionRefs(extension.sourceExpression)) {
                    out.push({ name, origin: `in mapping of ${label}`, confidence: "referenced" });
                }
            }
            break;
        }
        // `camunda:Out.target` writes a variable back into the calling process.
        case "camunda:Out": {
            if (typeof extension.target === "string" && extension.target) {
                out.push({
                    name: extension.target,
                    origin: `out mapping of ${label}`,
                    confidence: "declared",
                });
            }
            break;
        }
        case "camunda:ExecutionListener":
        case "camunda:TaskListener": {
            if (extension.script && typeof extension.script.value === "string") {
                for (const name of collectSetVariableNames(extension.script.value)) {
                    out.push({
                        name,
                        origin: `listener script of ${label}`,
                        confidence: "declared",
                    });
                }
                for (const name of collectSpinTypedNames(extension.script.value)) {
                    out.push({
                        name,
                        origin: `SPIN value in listener script of ${label}`,
                        typeHint: "SpinJsonNode",
                        confidence: "declared",
                    });
                }
            }
            break;
        }
    }
}

/** A mapped parameter's `name` is a declared variable (output) or local (input). */
function pushParameterName(param: any, origin: string, out: VariableDef[]): void {
    if (typeof param?.name === "string" && param.name) {
        out.push({ name: param.name, origin, confidence: "declared" });
    }
}

/** A mapped parameter's `value` may read other variables via `${...}`. */
function pushParameterValueRefs(param: any, origin: string, out: VariableDef[]): void {
    if (typeof param?.value === "string") {
        for (const name of collectExpressionRefs(param.value)) {
            out.push({ name, origin, confidence: "referenced" });
        }
    }
}

/** Quoted element id for an origin string, falling back when no id is present. */
function elementLabel(element: any): string {
    return typeof element?.id === "string" && element.id ? `"${element.id}"` : "an element";
}
