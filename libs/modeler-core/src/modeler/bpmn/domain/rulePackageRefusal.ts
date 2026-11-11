import { relativeToRoot } from "../../../kernel/domain/rootContainment";
import {
    AllowableRoot,
    ResolvedRuleModule,
    RuleModuleRefusal,
    ruleModuleRootOf,
} from "./rulePackageApproval";

/**
 * `insideGitFolder`: a file below the root inside a `.git` folder, which no
 * allowance covers. `movedByUpdate`: Node's cache still names a file of a
 * folder the package name led to before, and the current folder cannot serve
 * it before a reload.
 */
export type ModuleRefusal = RuleModuleRefusal | "insideGitFolder" | "movedByUpdate";

/** Workspace code that may not run whatever the user allows: logged with its reason, never offered. */
export interface RefusedRuleModule {
    readonly kind: "module";
    readonly file: string;
    readonly reason: ModuleRefusal;
}

export type RefusedModule = RefusedRuleModule;

const DOT_GIT = ".git";

/** The root whose allowance would cover running the module's file, or why none can. */
export function approvalRootOf(module: ResolvedRuleModule): AllowableRoot | RefusedModule {
    const root = ruleModuleRootOf(module);
    if (root.kind === "refused") {
        return { kind: "module", file: module.file, reason: root.reason };
    }
    const belowRoot = relativeToRoot(module.file, root.id)?.split("/") ?? [];
    return belowRoot.includes(DOT_GIT)
        ? { kind: "module", file: module.file, reason: "insideGitFolder" }
        : root;
}
