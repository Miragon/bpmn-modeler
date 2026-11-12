import { posix } from "path";

import { ActionNotice } from "../../../kernel/domain/actionNotice";
import {
    ALLOWANCE_COVERS_TEXT,
    Allowance,
    allowanceKeyOf,
    AllowanceState,
    ApprovableArtifact,
} from "../../../kernel/domain/allowance";
import { approvalRowsOf } from "../../../kernel/domain/approvalRowKind";
import {
    ApprovableCodeTexts,
    ApprovalNoticeAction,
    approvalsKey,
    CodeApproval,
    CodeApprovalChange,
    PROCESS_RESTART_TEXT,
} from "../../../kernel/domain/codeApproval";
import { installedPackageNameOf, NODE_MODULES } from "../../../kernel/domain/installedPackagePath";
import { ChoicePrompt } from "../../../kernel/domain/prompts";
import {
    isRootedPath,
    isWithinRoot,
    relativeToWorkspace,
    staysInsideFolder,
} from "../../../kernel/domain/rootContainment";
import { joinWorkspacePath } from "../../../kernel/domain/workspacePath";
import { manifestPathOf, PackageManifest, packageManifestOf } from "./installedPackage";

export const RULE_PACKAGE_APPROVAL_NOTICE_ID = "bpmnlintPackageApprovalNotice";

export const RULE_PACKAGE_APPROVAL_PROMPT_ID = "bpmnlintPackageApproval";

/** An installed bpmnlint rule package; its id is the realpath of its root folder. */
export interface RulePackage extends ApprovableArtifact {
    /** Empty when its manifest names none. */
    readonly version: string;
}

/** A module a rule package request resolved to; every path is a realpath spelled like `toWorkspacePath`. */
export interface ResolvedRuleModule {
    readonly file: string;
    readonly configDir: string;
    /** `<configDir>/package.json` names the requested package, so bpmnlint requires `.`. */
    readonly requestsSelfPackage: boolean;
    /** The realpath of the `node_modules/<name>` folder a bare request named; it differs from the file's own package folder for a `file:` link. */
    readonly requestedPackageDir?: string;
}

export type RuleModuleRefusal = "outsideNodeModules" | "noPackageFolder" | "linkHoldsConfigFolder";

export type RuleModuleRoot =
    | { readonly kind: "package" | "selfPackage"; readonly id: string }
    | { readonly kind: "refused"; readonly reason: RuleModuleRefusal };

export type AllowableRoot = Exclude<RuleModuleRoot, { kind: "refused" }>;

export type BlockedState = Exclude<AllowanceState, "allowed">;

/** As the gate reports it, ready to ask about without reading anything again. */
export interface BlockedRulePackage extends RulePackage {
    /** The config's own package is named so in the list. */
    readonly kind: AllowableRoot["kind"];
    readonly state: BlockedState;
    /** A request ended unresolved because of it; otherwise the bundle served it. */
    readonly needed: boolean;
}

export type RulePackageApprovalNoticeAction = ApprovalNoticeAction;

const SCOPE_PREFIX = "@";

/**
 * Npm allows none of these: joined under `node_modules`, a `.`-led part or a
 * backslash, which Windows reads as a separator, would leave it.
 */
const isUnsafeNamePart = (part: string) =>
    part === "" || part.startsWith(".") || part.includes("\\");

export function requestedPackageNameOf(request: string): string | undefined {
    if (isRootedPath(request)) {
        return undefined;
    }
    const nameLength = request.startsWith(SCOPE_PREFIX) ? 2 : 1;
    const nameParts = request.split("/").slice(0, nameLength);
    return nameParts.length < nameLength || nameParts.some(isUnsafeNamePart)
        ? undefined
        : nameParts.join("/");
}

/** Where a package name leads now from the config folder. */
export interface CurrentPackageFolder {
    readonly name: string;
    /** The realpath of the folder the name's lookup path leads to. */
    readonly currentRoot: string;
    /** The lookup path is a link, whose earlier target Node's cache can still hold. */
    readonly linked: boolean;
}

export type CurrentResolution =
    | { readonly kind: "keep" }
    | { readonly kind: "redirect"; readonly file: string; readonly staleRoot: string }
    /** Node's answer lies in a folder outside every `node_modules` the name led to before, whose root is unknown: look the request up again in the current folder. */
    | { readonly kind: "lookUp" };

export type CurrentFolderRequest =
    | { readonly kind: "file"; readonly file: string }
    /** Resolved from inside the current folder, so Node reads that folder's `exports`, not the ones it cached for the link. */
    | { readonly kind: "selfReference"; readonly request: string };

const KEEP: CurrentResolution = { kind: "keep" };

/**
 * Node and Bun cache a resolution per process, so after pnpm retargets
 * `node_modules/<name>` to a new store folder they still answer with the old
 * one, gone or not. A file in another root of the same package moves to the
 * same place below the current one; whether it exists there is the caller's
 * to check. The store folders of an alias carry the package's own name, not
 * the requested one. A lookup path that is a folder of its own has no earlier
 * target, so another copy of the name, such as a nested one, stays its own root.
 */
export function currentResolutionOf(
    resolved: string,
    request: string,
    { name, currentRoot, linked }: CurrentPackageFolder,
): CurrentResolution {
    if (isWithinRoot(resolved, currentRoot)) {
        return KEEP;
    }
    const staleRoot = installedPackageRootOf(resolved);
    if (staleRoot === undefined) {
        return requestedPackageNameOf(request) === name ? { kind: "lookUp" } : KEEP;
    }
    if (!linked || staleRoot.kind !== "package") {
        return KEEP;
    }
    const staleName = installedPackageNameOf(staleRoot.id);
    if (staleName !== name && staleName !== storeNameOf(currentRoot)) {
        return KEEP;
    }
    const file = fileBelow(currentRoot, resolved.slice(staleRoot.id.length + 1));
    return file === undefined ? KEEP : { kind: "redirect", file, staleRoot: staleRoot.id };
}

function storeNameOf(root: string): string | undefined {
    return installedPackagesDirOf(root) === undefined ? undefined : installedPackageNameOf(root);
}

/**
 * Where a bare request for the package leads in its current folder, for a
 * request Node failed or answered from a folder the name no longer leads to.
 * A package with `exports` is asked by its own name from inside that folder,
 * as joining the subpath would skip its `exports`.
 */
export function currentFolderRequestOf(
    request: string,
    { name, currentRoot }: Pick<CurrentPackageFolder, "name" | "currentRoot">,
    manifest: PackageManifest | undefined,
): CurrentFolderRequest | undefined {
    if (requestedPackageNameOf(request) !== name) {
        return undefined;
    }
    const belowRoot = request.slice(name.length + 1);
    const file = fileBelow(currentRoot, belowRoot);
    if (file === undefined) {
        return undefined;
    }
    if (manifest?.hasExports !== true) {
        return { kind: "file", file };
    }
    if (manifest.name === "") {
        return undefined;
    }
    return {
        kind: "selfReference",
        request: belowRoot === "" ? manifest.name : `${manifest.name}/${belowRoot}`,
    };
}

function fileBelow(root: string, belowRoot: string): string | undefined {
    return staysInsideFolder(belowRoot) ? joinWorkspacePath(root, belowRoot) : undefined;
}

/**
 * The root a module belongs to. Only an installed package folder or the
 * config's own package can be one: any other folder, such as the one an
 * absolute rule reference points into, would let one allowance cover the repo.
 */
export function ruleModuleRootOf(module: ResolvedRuleModule): RuleModuleRoot {
    const installed = installedPackageRootOf(module.file);
    if (installed !== undefined) {
        return installed;
    }
    const linked = module.requestedPackageDir;
    if (linked !== undefined && isWithinRoot(module.file, linked)) {
        return linkedPackageRoot(linked, [module.configDir]);
    }
    if (module.requestsSelfPackage && isWithinRoot(module.file, module.configDir)) {
        return { kind: "selfPackage", id: module.configDir };
    }
    return { kind: "refused", reason: "outsideNodeModules" };
}

/** A linked folder that holds a lint config would let one allowance cover that config's repo. */
function linkedPackageRoot(linked: string, configDirs: readonly string[]): RuleModuleRoot {
    return configDirs.some((configDir) => isWithinRoot(configDir, linked))
        ? { kind: "refused", reason: "linkHoldsConfigFolder" }
        : { kind: "package", id: linked };
}

/** By the last `node_modules`, so a nested copy is its own root for stamps and ids; `undefined` outside every one. */
function installedPackageRootOf(file: string): RuleModuleRoot | undefined {
    const segments = file.split("/");
    const nodeModules = segments.lastIndexOf(NODE_MODULES);
    if (nodeModules === -1) {
        return undefined;
    }
    const scoped = segments[nodeModules + 1]?.startsWith(SCOPE_PREFIX) === true;
    const nameEnd = nodeModules + (scoped ? 2 : 1);
    const nameSegments = segments.slice(nodeModules + 1, nameEnd + 1);
    if (nameEnd >= segments.length - 1 || nameSegments.some((each) => each.startsWith("."))) {
        return { kind: "refused", reason: "noPackageFolder" };
    }
    return { kind: "package", id: segments.slice(0, nameEnd + 1).join("/") };
}

export function rulePackageOf(
    id: string,
    manifestText: string | undefined,
    allowance: Allowance,
): RulePackage {
    const manifest = manifestText === undefined ? undefined : packageManifestOf(manifestText);
    const name = manifest?.name ?? "";
    return {
        id,
        name: name === "" ? installedPackageNameOf(id) : name,
        version: manifest?.version ?? "",
        allowance,
    };
}

export function rulePackageLabelOf({
    name,
    version,
}: Pick<RulePackage, "name" | "version">): string {
    return version === "" ? name : `${name}@${version}`;
}

/**
 * Only packages whose absence left a rule or config unresolved, one per
 * allowance, the first: a package the bundle stood in for is never asked
 * about, and a hoisted and a nested copy are one add-on.
 */
export function rulePackagesToAsk(
    blocked: readonly BlockedRulePackage[],
    queuedKeys: ReadonlySet<string> = new Set(),
): BlockedRulePackage[] {
    const asked = new Map<string, BlockedRulePackage>();
    for (const each of blocked) {
        const key = allowanceKeyOf(each.allowance);
        if (each.needed && each.state !== "declined" && !queuedKeys.has(key) && !asked.has(key)) {
            asked.set(key, each);
        }
    }
    return [...asked.values()];
}

/**
 * The editors whose last host lint a change of rule package approvals makes
 * stale, each once: an allow every editor blocked on any package, because an
 * allowance covers every place of its add-on; a revoke every host-linted
 * editor, because it must reach the loaded code wherever it ran.
 */
export function editorsToRelint(
    blockedByEditor: ReadonlyMap<string, readonly string[]>,
    hostLinted: readonly string[],
    change: CodeApprovalChange,
): string[] {
    const blocked =
        change.allow.length === 0
            ? []
            : [...blockedByEditor]
                  .filter(([, blockedIds]) => blockedIds.length > 0)
                  .map(([editorId]) => editorId);
    return [...new Set([...blocked, ...(change.revoke.length > 0 ? hostLinted : [])])];
}

/**
 * The lookup path is left unresolved: `stat` follows its link, so a pnpm
 * update that retargets it stamps differently even when the old store folder stays.
 */
export function rootStampPathsOf(rootId: string, lookupDir: string | undefined): string[] {
    return [...new Set([rootId, ...(lookupDir === undefined ? [] : [lookupDir])])].map(
        manifestPathOf,
    );
}

/**
 * The `node_modules` the root is installed in: a hoisted dependency lives
 * beside the root, so evicting the root alone would rerun it against the old
 * dependency. The config's own package and a linked one keep theirs inside.
 */
export function evictionScopeOf(rootId: string): string {
    return installedPackagesDirOf(rootId) ?? rootId;
}

/**
 * Part of the lint setup's fingerprint, so an allow or a revoke rebuilds the
 * setup and drops the bundled fallbacks it cached.
 */
export function rulePackageApprovalsKey(approvals: readonly CodeApproval[]): string {
    return approvalsKey(approvalRowsOf("rulePackage", approvals));
}

/** Opens nothing by itself: only "Review…" shows the list. */
export function rulePackageApprovalNotice(
    pending: readonly RulePackage[],
): ActionNotice<RulePackageApprovalNoticeAction> {
    const message =
        pending.length === 1
            ? "1 bpmnlint rule package in this workspace is not allowed yet, so rules from it are skipped."
            : `${pending.length} bpmnlint rule packages in this workspace are not allowed yet, so rules from them are skipped.`;
    return {
        id: RULE_PACKAGE_APPROVAL_NOTICE_ID,
        tone: "info",
        message,
        actions: [{ label: "Review…", value: "review" }],
    };
}

export const RULE_PACKAGE_CODE_TEXTS: ApprovableCodeTexts = {
    risk: "A rule package runs as a program with your user's rights, not only inside the editor.",
    allowedFollowUp: "Open editors lint again with it.",
    revokedFollowUp: (restart) =>
        `Code it already ran stays loaded until you ${PROCESS_RESTART_TEXT[restart]}.`,
};

const ROOT_KIND_DESCRIPTION: Record<AllowableRoot["kind"], string> = {
    package: "",
    selfPackage: " · the package the .bpmnlintrc sits in",
};

/** The folder goes into `description`: every host shows a `path` in place of it. */
export function rulePackageApprovalPrompt(
    pending: readonly BlockedRulePackage[],
    workspaceFolders: readonly string[],
): ChoicePrompt<string> {
    const single = pending.length === 1;
    return {
        id: RULE_PACKAGE_APPROVAL_PROMPT_ID,
        title: single
            ? "Allow a bpmnlint rule package from this workspace?"
            : "Allow bpmnlint rule packages from this workspace?",
        placeholder: single
            ? `${RULE_PACKAGE_CODE_TEXTS.risk} Allowing it ${ALLOWANCE_COVERS_TEXT}. Check it only if you trust it. ${RULE_PACKAGE_CODE_TEXTS.allowedFollowUp}`
            : `Rule packages run as programs with your user's rights, not only inside the editor. Allowing one ${ALLOWANCE_COVERS_TEXT}. Check only the ones you trust; open editors lint again with them.`,
        items: pending.map((each) => ({
            label: rulePackageLabelOf(each),
            description:
                relativeToWorkspace(each.id, workspaceFolders) + ROOT_KIND_DESCRIPTION[each.kind],
            value: each.id,
        })),
    };
}

/**
 * Node picks the loader by the exact extension and skips a leading dot, so
 * `acme.JSON` and `.json` run as scripts. The path is spelled like `toWorkspacePath`.
 */
export function isParsedAsJson(path: string): boolean {
    return posix.extname(path) === ".json";
}

/** A built-in module, which resolves to no path, or JSON data. */
export function loadsWithoutApproval(resolved: string): boolean {
    return !isRootedPath(resolved) || isParsedAsJson(resolved);
}

export function nodeModulesDirOf(dir: string): string {
    return joinWorkspacePath(dir, NODE_MODULES);
}

/** The last `node_modules` a package folder is installed in; `undefined` for a folder outside every one. */
export function installedPackagesDirOf(id: string): string | undefined {
    const segments = id.split("/");
    const nodeModules = segments.lastIndexOf(NODE_MODULES);
    return nodeModules === -1 ? undefined : segments.slice(0, nodeModules + 1).join("/");
}

export interface RootKindFacts {
    /** The kind the gate reported, when it blocked the folder this session. */
    readonly reported?: BlockedRulePackage["kind"];
    /** The real folders of the lint configs read so far. */
    readonly realConfigDirs: readonly string[];
    /** A `node_modules` entry links to the folder. */
    readonly linkedFromNodeModules: boolean;
}

/**
 * How the gate would take a folder, or why it refuses it: as the config's own
 * package or as an installed one, while a linked folder holding a config read
 * so far is refused. A folder outside `node_modules` that is neither a
 * config's folder read so far nor linked from one cannot be told yet.
 */
export function rootKindOf(id: string, facts: RootKindFacts): RuleModuleRoot | undefined {
    if (facts.reported !== undefined) {
        return { kind: facts.reported, id };
    }
    if (facts.realConfigDirs.includes(id)) {
        return { kind: "selfPackage", id };
    }
    if (installedPackagesDirOf(id) !== undefined) {
        return { kind: "package", id };
    }
    return facts.linkedFromNodeModules ? linkedPackageRoot(id, facts.realConfigDirs) : undefined;
}
