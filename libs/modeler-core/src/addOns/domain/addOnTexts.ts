import { CODE_STATE_TEXT, CodeState } from "../../kernel/domain/codeApproval";
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

/** What the owner says its code can do once allowed, shown before the user allows it. */
export function allowWarningText(risk: string): string {
    return `${risk} Allow it only if you trust it.`;
}

export const ACTION_LABEL = {
    inspect: "Review…",
    allow: "Allow this content",
    revoke: "Revoke",
    forget: "Forget",
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
    files: "Covers",
    contentHash: "Content hash",
} as const;

export const NO_FOLDER_TEXT =
    "Open a folder to see the plugins, rule packages and element templates it brings.";

export const NO_ADD_ON_TEXT =
    "No BPMN plugins, bpmnlint rule packages or element templates in this workspace.";

export const MARKETPLACES_GROUP_TEXT = {
    label: "Marketplaces",
    description: "Element templates fetched from the registered marketplaces",
} as const;

export const INSTALLED_PACKAGES_TEXT = "Installed packages";

export const ROOT_CONFIG_FOLDER_TEXT = "Applies to every diagram in this folder";

export function nestedConfigFolderText(belowRoot: string): string {
    return `Applies to diagrams below ${belowRoot}/`;
}

/** The same words the approval list and the log use, as a label of its own. */
export function codeStateLabel(state: CodeState): string {
    const text = CODE_STATE_TEXT[state];
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function reviewHeading(name: string): string {
    return `Review ${name} before you allow it`;
}

export function cannotBeAllowedText(reason: string): string {
    return `Cannot be allowed: ${reason}.`;
}

export function templateVersionText(version: number): string {
    return `Version ${version}`;
}

export function cannotBeReadText(reason: string): string {
    return `Cannot be read: ${reason}.`;
}
