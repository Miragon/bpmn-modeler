import { VariableDef } from "@miragon/bpmn-modeler-types";
import { LocalDeclaration } from "./localDeclarations";

// IntelliJ's ScriptCompletionDetailTest holds the Kotlin copy to this literal.
export const UNTYPED_PROCESS_VARIABLE_DETAIL = "process variable";

/** The type a completion shows beside a process variable. */
export function processVariableDetail(variable: Pick<VariableDef, "typeHint">): string {
    return variable.typeHint ?? UNTYPED_PROCESS_VARIABLE_DETAIL;
}

/** The type a completion shows beside a local declaration; a cast-typed local reads like a typed process variable. */
export function localDeclarationDetail(
    declaration: Pick<LocalDeclaration, "kind" | "typeHint">,
): string {
    if (declaration.kind === "function") {
        return "local function";
    }
    return declaration.typeHint ?? "local variable";
}
