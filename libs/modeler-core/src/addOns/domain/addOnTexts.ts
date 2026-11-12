import { Allowance, LOCAL_HOST, repositoryFolderOf } from "../../kernel/domain/allowance";
import type { CodeState } from "../../kernel/domain/codeApproval";
import { AddOnKind, TemplateState } from "./addOnIds";

export const ADD_ON_KIND_TEXT: Record<AddOnKind, string> = {
    plugin: "BPMN plugin",
    rulePackage: "bpmnlint rule package",
    elementTemplate: "Element template",
};

export const TEMPLATE_STATE_TEXT: Record<TemplateState, string> = {
    enabled: "Enabled",
    disabled: "Disabled",
};

export const TEMPLATE_SOURCE_DISABLED_NOTE = "Its source is disabled.";

export const TEMPLATES_DISABLED_TEXT = "Templates disabled";

const ALLOWANCE_COVERAGE_TEXT: Record<Allowance["origin"]["kind"], string> = {
    repository: "covers it in every worktree of this repository",
    folder: "covers this folder",
};

/** What the owner says its code can do once allowed, and how far an allow reaches, shown before the user allows it. */
export function allowWarningText(risk: string, allowance: Allowance): string {
    return `${risk} Allowing it ${ALLOWANCE_COVERAGE_TEXT[allowance.origin.kind]}, later changes included. Allow it only if you trust it.`;
}

export function allowedInText(allowance: Allowance): string {
    const repository = repositoryFolderOf(allowance);
    if (repository === undefined) {
        return "this folder only";
    }
    const host = allowance.host === LOCAL_HOST ? "" : ` on ${allowance.host}`;
    return `every worktree of ${repository}${host}`;
}

export const ACTION_LABEL = {
    allow: "Allow",
    revoke: "Revoke",
    pruneCache: "Remove unused plugin copies",
    addMarketplace: "Add marketplace…",
    updateMarketplaces: "Update marketplaces",
    removeMarketplace: "Remove",
    enable: "Enable",
    disable: "Disable",
    enableTemplates: "Enable templates",
    disableTemplates: "Disable templates",
} as const;

export const REVIEW_FACT_LABEL = {
    folder: "Folder",
    version: "Version",
    allowedIn: "Allowed in",
} as const;

export const NO_FOLDER_TEXT =
    "Open a folder to see the plugins, rule packages and element templates it brings.";

export const NO_ADD_ON_TEXT =
    "No BPMN plugins, bpmnlint rule packages or element templates in this workspace.";

export const CATALOG_READ_FAILED_TEXT = "Could not list the add-ons. The log says why.";

export const CATALOG_REREAD_FAILED_TEXT =
    "Could not list the add-ons again. The list shows what it read before; the log says why.";

export const MARKETPLACES_GROUP_TEXT = {
    label: "Marketplaces",
    description: "Element templates fetched from the registered marketplaces",
} as const;

export const INSTALLED_PACKAGES_TEXT = "Installed packages";

export const ROOT_CONFIG_FOLDER_TEXT = "Applies to every diagram in this folder";

export function nestedConfigFolderText(belowRoot: string): string {
    return `Applies to diagrams below ${belowRoot}/`;
}

export const CODE_STATE_LABEL: Record<CodeState, string> = {
    approved: "Allowed",
    new: "Not allowed yet",
    declined: "Declined this session",
};

export function reviewHeading(name: string): string {
    return `Review ${name} before you allow it`;
}

export const UNTRUSTED_WORKSPACE_TEXT =
    "Does not run: you have not trusted this project. Trust it to allow and run its code.";

export function cannotBeAllowedText(reason: string): string {
    return `Cannot be allowed: ${reason}.`;
}

export function templateVersionText(version: number): string {
    return `Version ${version}`;
}

export function cannotBeReadText(reason: string): string {
    return `Cannot be read: ${reason}.`;
}
