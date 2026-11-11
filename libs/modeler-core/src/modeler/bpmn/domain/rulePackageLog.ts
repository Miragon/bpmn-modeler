import { BlockedRulePackage, BlockedState, rulePackageLabelOf } from "./rulePackageApproval";
import { ModuleRefusal, RefusedRuleModule } from "./rulePackageRefusal";

const MODULE_REFUSAL_TEXT: Record<ModuleRefusal, string> = {
    outsideNodeModules:
        "it is neither in node_modules nor in the config's own package, so no allowance can cover it",
    noPackageFolder: "it belongs to no installed package folder",
    linkHoldsConfigFolder:
        "the package link it comes through points to a folder that holds the config",
    insideGitFolder: "it lies inside a .git folder, which no allowance covers",
    movedByUpdate:
        "an update moved the package to a new folder that has no such file; reload the window or restart the IDE to load the updated package",
};

const BLOCKED_STATE_TEXT: Record<BlockedState, string> = {
    new: "new",
    declined: "declined this session",
};

/** Why a module, or a folder the catalog would list, can run under no allowance. */
export function ruleModuleRefusalText(reason: ModuleRefusal): string {
    return MODULE_REFUSAL_TEXT[reason];
}

function byId(blocked: readonly BlockedRulePackage[]): BlockedRulePackage[] {
    return [...new Map(blocked.map((each) => [each.id, each])).values()];
}

function namedPackageOf(rulePackage: BlockedRulePackage): string {
    return `${rulePackageLabelOf(rulePackage)} (${rulePackage.id})`;
}

/** One line per package whose absence skipped a rule. */
export function neededRulePackageLogLines(blocked: readonly BlockedRulePackage[]): string[] {
    return byId(blocked.filter((each) => each.needed)).map(
        (each) =>
            `bpmnlint: rule package ${namedPackageOf(each)} is not allowed yet (${BLOCKED_STATE_TEXT[each.state]}), so rules from it are skipped.`,
    );
}

/** Sorted, so a caller can tell a set it already logged by the line alone. */
export function shadowedRulePackageLogLine(
    blocked: readonly BlockedRulePackage[],
): string | undefined {
    const needed = new Set(blocked.filter((each) => each.needed).map(({ id }) => id));
    const shadowed = [
        ...new Set(byId(blocked.filter(({ id }) => !needed.has(id))).map(namedPackageOf)),
    ].sort();
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
    return `bpmnlint: refused to run ${refused.file}: ${ruleModuleRefusalText(refused.reason)}.`;
}

/** Why a folder no lint has reported cannot be allowed yet. */
export const ROOT_KIND_UNKNOWN_TEXT = "lint a diagram that uses it first";
