import { posix } from "path";

import { ActionNotice } from "../../../kernel/domain/actionNotice";
import {
    ApprovableArtifact,
    ApprovableCodeTexts,
    ApprovalNoticeAction,
    approvalsKey,
    CodeApproval,
    CodeState,
    codeStateOf,
    FollowedApprovalChange,
    isApprovedState,
    PendingCodeApproval,
    pendingApprovalDescription,
    PROCESS_RESTART_TEXT,
} from "../../../kernel/domain/codeApproval";
import {
    approvalRowsOf,
    RULE_PACKAGE_CONTENT_HASH_PREFIX,
} from "../../../kernel/domain/approvalRowKind";
import { NODE_MODULES } from "../../../kernel/domain/installedPackagePath";
import { ChoicePrompt } from "../../../kernel/domain/prompts";
import { isRootedPath, isWithinRoot } from "../../../kernel/domain/rootContainment";
import { joinWorkspacePath } from "../../../kernel/domain/workspacePath";

export const RULE_PACKAGE_APPROVAL_NOTICE_ID = "bpmnlintPackageApprovalNotice";

export const RULE_PACKAGE_APPROVAL_PROMPT_ID = "bpmnlintPackageApproval";

/** An installed bpmnlint rule package; its id is the realpath of its root folder. */
export interface RulePackage extends ApprovableArtifact {
    readonly version: string;
}

export type PendingRulePackage = PendingCodeApproval<RulePackage>;

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

export interface PackageFileDigest {
    /** `/`-separated below the member folder. */
    readonly relPath: string;
    readonly sha256: string;
}

export interface ClosureMember {
    readonly name: string;
    readonly version: string;
    readonly digest: string;
}

export interface RulePackageVerdictContext {
    readonly approvals: readonly CodeApproval[];
    /** Member folders of every closure admitted so far in this lint setup. */
    readonly admittedMembers: ReadonlySet<string>;
    /** {@link declineKeyOf} of each package the user declined this session. */
    readonly declinedThisSession: ReadonlySet<string>;
}

export type BlockedState = Extract<CodeState, "new" | "changed" | "declined">;

export type RulePackageVerdict =
    | { readonly kind: "admitted"; readonly via: "approval" | "closure" }
    | { readonly kind: "hashNeeded" }
    | { readonly kind: "blocked"; readonly state: BlockedState };

export interface BlockedRulePackage {
    readonly id: string;
    /** The config's own package hashes without its models, so asking about it must know which it is. */
    readonly kind: Exclude<RuleModuleRoot["kind"], "refused">;
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

/**
 * The approval unit a module belongs to. Only an installed package folder or
 * the config's own package can be one: any other folder, such as the one an
 * absolute rule reference points into, would let one approval cover the repo.
 */
export function ruleModuleRootOf(module: ResolvedRuleModule): RuleModuleRoot {
    const segments = module.file.split("/");
    const nodeModules = segments.lastIndexOf(NODE_MODULES);
    if (nodeModules !== -1) {
        return installedPackageRoot(segments, nodeModules);
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

/** A linked folder that holds a lint config would let one approval cover that config's repo. */
function linkedPackageRoot(linked: string, configDirs: readonly string[]): RuleModuleRoot {
    return configDirs.some((configDir) => isWithinRoot(configDir, linked))
        ? { kind: "refused", reason: "linkHoldsConfigFolder" }
        : { kind: "package", id: linked };
}

/** The last `node_modules`, so a nested package is its own unit and never its parent's. */
function installedPackageRoot(segments: readonly string[], nodeModules: number): RuleModuleRoot {
    const scoped = segments[nodeModules + 1]?.startsWith(SCOPE_PREFIX) === true;
    const nameEnd = nodeModules + (scoped ? 2 : 1);
    const nameSegments = segments.slice(nodeModules + 1, nameEnd + 1);
    if (nameEnd >= segments.length - 1 || nameSegments.some((each) => each.startsWith("."))) {
        return { kind: "refused", reason: "noPackageFolder" };
    }
    return { kind: "package", id: segments.slice(0, nameEnd + 1).join("/") };
}

/**
 * NUL ends every field: no path or name holds one, so no two inputs read alike.
 * Lines sort by UTF-16 code unit, `sort()`'s default, never by locale.
 */
const field = (text: string) => `${text}\u0000`;

/** What a member's digest hashes: every file by path and content hash, in a fixed order. */
export function memberDigestInput(files: readonly PackageFileDigest[]): string {
    return files
        .map(({ relPath, sha256 }) => field(relPath) + field(sha256))
        .sort()
        .join("");
}

/**
 * What a closure's digest hashes: the root, then each member by name@version.
 * No member's folder enters it, so hoisting or deduping keeps the digest,
 * and identical copies count once.
 */
export function closureDigestInput(root: ClosureMember, members: readonly ClosureMember[]): string {
    const line = ({ name, version, digest }: ClosureMember) =>
        field(`${name}@${version}`) + field(digest);
    const memberLines = [...new Set(members.map(line))].sort();
    return `${line(root)}\n${memberLines.join("")}`;
}

/** The prefix names the digest algorithm, so a change to {@link closureDigestInput} asks again. */
export function rulePackageContentHash(closureDigest: string): string {
    return RULE_PACKAGE_CONTENT_HASH_PREFIX + closureDigest;
}

/**
 * Whether a rule package may run: admitted by any rule package row of its
 * content, wherever that row sits. It hashes only when a row or a decline
 * could match, so while no rule package row exists a package costs no
 * hashing: `hashNeeded` asks the caller to come back with the current hash.
 */
export function rulePackageVerdict(
    rootId: string,
    context: RulePackageVerdictContext,
    contentHash?: string,
): RulePackageVerdict {
    if (context.admittedMembers.has(rootId)) {
        return { kind: "admitted", via: "closure" };
    }
    const reading = codeStateOf(
        contentHash === undefined
            ? { kind: "unhashed", id: rootId }
            : { kind: "found", artifact: { id: rootId, name: rootId, contentHash } },
        approvalRowsOf("rulePackage", context.approvals),
        context.declinedThisSession,
    );
    if (reading.kind === "hashNeeded") {
        return reading;
    }
    return isApprovedState(reading.state)
        ? { kind: "admitted", via: "approval" }
        : { kind: "blocked", state: reading.state };
}

/** Only packages whose absence left a rule or config unresolved: a package the bundle stood in for is never asked about. */
export function rulePackagesToAsk(
    blocked: readonly BlockedRulePackage[],
    alreadyQueuedIds: ReadonlySet<string> = new Set(),
): BlockedRulePackage[] {
    const asked = new Map<string, BlockedRulePackage>();
    for (const each of blocked) {
        if (
            each.needed &&
            each.state !== "declined" &&
            !alreadyQueuedIds.has(each.id) &&
            !asked.has(each.id)
        ) {
            asked.set(each.id, each);
        }
    }
    return [...asked.values()];
}

/**
 * The editors whose last host lint a change of rule package approvals makes
 * stale, each once: an allow every editor blocked on any package, because a
 * row at one place admits the same content at every other; a withdrawn
 * approval every host-linted editor, because a withdrawal must reach the
 * loaded code wherever it ran.
 */
export function editorsToRelint(
    blockedByEditor: ReadonlyMap<string, readonly string[]>,
    hostLinted: readonly string[],
    { change, withdrawn }: FollowedApprovalChange,
): string[] {
    const blocked =
        change.allow.length === 0
            ? []
            : [...blockedByEditor]
                  .filter(([, blockedIds]) => blockedIds.length > 0)
                  .map(([editorId]) => editorId);
    return [...new Set([...blocked, ...(withdrawn.length > 0 ? hostLinted : [])])];
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
    pending: readonly PendingRulePackage[],
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
    carriedOver: ({ artifact, allowedAt }) =>
        `Allowed bpmnlint rule package ${artifact.name} in ${artifact.id}: you allowed the same content in ${allowedAt}.`,
};

export function rulePackageApprovalPrompt(
    pending: readonly PendingRulePackage[],
    workspaceFolders: readonly string[],
): ChoicePrompt<string> {
    const single = pending.length === 1;
    return {
        id: RULE_PACKAGE_APPROVAL_PROMPT_ID,
        title: single
            ? "Allow a bpmnlint rule package from this workspace?"
            : "Allow bpmnlint rule packages from this workspace?",
        placeholder: single
            ? `${RULE_PACKAGE_CODE_TEXTS.risk} Check it only if you trust it. ${RULE_PACKAGE_CODE_TEXTS.allowedFollowUp}`
            : "Rule packages run as programs with your user's rights, not only inside the editor. Check only the ones you trust; open editors lint again with them.",
        items: pending.map((each) => ({
            label: `${each.artifact.name} ${each.artifact.version}`,
            description: pendingApprovalDescription(each, workspaceFolders),
            value: each.artifact.id,
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
 * How the gate would hash a folder, or why it refuses it: the config's own
 * package hashes without its models, and a linked folder holding a config
 * read so far is refused. A folder outside `node_modules` that is neither a
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
