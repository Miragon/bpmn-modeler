import { ClosureRefusal, FingerprintedRoot, isHashedMemberFile } from "./packageClosure";
import { ResolvedRuleModule, RuleModuleRefusal, ruleModuleRootOf } from "./rulePackageApproval";

/** `notHashed`: a file in an approvable folder that its content hash leaves out, so no approval covers it. */
export type ModuleRefusal = RuleModuleRefusal | "notHashed";

/** Workspace code that may not run whatever the user allows: logged with its reason, never offered. */
export type RefusedRuleModule =
    | { readonly kind: "module"; readonly file: string; readonly reason: ModuleRefusal }
    | {
          readonly kind: "closure";
          readonly id: string;
          readonly memberDir: string;
          readonly reason: ClosureRefusal;
      };

export type RefusedModule = Extract<RefusedRuleModule, { readonly kind: "module" }>;

/** The root whose approval would cover running the module's file, or why none can. */
export function approvalRootOf(module: ResolvedRuleModule): FingerprintedRoot | RefusedModule {
    const root = ruleModuleRootOf(module);
    if (root.kind === "refused") {
        return { kind: "module", file: module.file, reason: root.reason };
    }
    return isHashedMemberFile(module.file, root)
        ? root
        : { kind: "module", file: module.file, reason: "notHashed" };
}
