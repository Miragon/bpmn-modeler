import { CODE_STATE_TEXT } from "../../../kernel/domain/codeApproval";
import { ClosureRefusal } from "./packageClosure";
import { BlockedRulePackage } from "./rulePackageApproval";
import { ModuleRefusal, RefusedRuleModule } from "./rulePackageRefusal";

const MODULE_REFUSAL_TEXT: Record<ModuleRefusal, string> = {
    outsideNodeModules:
        "it is neither in node_modules nor in the config's own package, so no approval can cover it",
    noPackageFolder: "it belongs to no installed package folder",
    linkHoldsConfigFolder:
        "the package link it comes through points to a folder that holds the config",
    notHashed: "the rule package's content hash leaves it out",
};

const CLOSURE_REFUSAL_TEXT: Record<ClosureRefusal, string> = {
    linksOutsideFolder: "links to files outside its folder",
    tooLarge: "is too large to check",
    unreadable: "could not be read",
    specialFile: "holds a file that is not a regular file",
    unsupportedLayout: "is installed in a layout the check does not support",
};

function byId(blocked: readonly BlockedRulePackage[]): BlockedRulePackage[] {
    return [...new Map(blocked.map((each) => [each.id, each])).values()];
}

/** One line per package whose absence skipped a rule. */
export function neededRulePackageLogLines(blocked: readonly BlockedRulePackage[]): string[] {
    return byId(blocked.filter((each) => each.needed)).map(
        ({ id, state }) =>
            `bpmnlint: rule package ${id} is not allowed yet (${CODE_STATE_TEXT[state]}), so rules from it are skipped.`,
    );
}

/** Sorted, so a caller can tell a set it already logged by the line alone. */
export function shadowedRulePackageLogLine(
    blocked: readonly BlockedRulePackage[],
): string | undefined {
    const needed = new Set(blocked.filter((each) => each.needed).map(({ id }) => id));
    const shadowed = [...new Set(blocked.map(({ id }) => id))]
        .filter((id) => !needed.has(id))
        .sort();
    if (shadowed.length === 0) {
        return undefined;
    }
    const subject =
        shadowed.length === 1
            ? "a rule package that is not allowed yet"
            : "rule packages that are not allowed yet";
    return `bpmnlint: bundled rules stand in for ${subject}: ${shadowed.join(", ")}`;
}

export function refusedRuleModuleLogLine(refused: RefusedRuleModule): string {
    if (refused.kind === "module") {
        return `bpmnlint: refused to run ${refused.file}: ${MODULE_REFUSAL_TEXT[refused.reason]}.`;
    }
    return `bpmnlint: rule package ${refused.id} cannot be allowed: ${closureRefusalText(refused)}.`;
}

/** Why a rule package cannot be allowed, as a clause that names it or its dependency. */
export function closureRefusalText({
    id,
    memberDir,
    reason,
}: {
    readonly id: string;
    readonly memberDir: string;
    readonly reason: ClosureRefusal;
}): string {
    const member = memberDir === id ? "it" : `its dependency ${memberDir}`;
    return `${member} ${CLOSURE_REFUSAL_TEXT[reason]}`;
}
