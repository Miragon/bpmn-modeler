import { confirmation } from "../../kernel/domain/affectedItems";
import { fileChoice, fileChoicesInWorkspaceOrder } from "../../kernel/domain/fileChoices";
import { ChoiceItem, ChoicePrompt, ConfirmRequest } from "../../kernel/domain/prompts";
import { CredentialDestinations } from "./credentialDestinations";
import { DeploymentDestination } from "./deploymentDestination";
import { StatusConnection } from "./deploymentStatusView";

export type DeploymentStatusAction = "switch" | "verify";

/** Kept nearest first as found, the one file list whose order means something. */
export function payloadFilePrompt(paths: readonly string[]): ChoicePrompt<string> {
    return {
        id: "payloadFile",
        placeholder: "Select a payload file",
        items: paths.map(fileChoice),
    };
}

/** The first entry chooses the ad-hoc connection, as `""`. */
export function deploymentTargetPrompt(names: readonly string[]): ChoicePrompt<string> {
    return {
        id: "deploymentTarget",
        placeholder: "Select the active deployment target",
        items: [
            { label: "(none — use form values)", value: "" },
            ...names.map((name) => ({ label: name, value: name })),
        ],
    };
}

/** The status-bar item's click menu. Only Camunda 7 has a deployment lookup to verify against. */
export function deploymentStatusActionPrompt(
    activeDestination: Pick<DeploymentDestination, "statusConnection" | "target">,
): ChoicePrompt<DeploymentStatusAction> {
    const { statusConnection, target } = activeDestination;
    const items: ChoiceItem<DeploymentStatusAction>[] = [
        { label: "Switch deployment target…", icon: "swap", value: "switch" },
    ];
    if (target?.engine === "c7") {
        items.push({ label: `Verify on ${target.name}`, icon: "cloud", value: "verify" });
    }
    return {
        id: "deploymentStatusAction",
        placeholder: statusActionPlaceholder(statusConnection),
        items,
    };
}

/** Reads the connection the status item names, so the item and its menu cannot disagree. */
function statusActionPlaceholder(connection: StatusConnection): string {
    switch (connection.kind) {
        case "named":
            return `Deployment target "${connection.name}"`;
        case "formValues":
            return "Deployment with the form values";
        case "none":
            return "No deployment target selected";
    }
}

/** What a workspace search found, and the folders it searched. */
export interface FoundFiles {
    readonly files: readonly string[];
    readonly workspaceFolders: readonly string[];
}

export function deployableFilesPrompt({
    targetName,
    files,
    workspaceFolders,
}: FoundFiles & { readonly targetName: string }): ChoicePrompt<string> {
    return {
        id: "deployableFiles",
        placeholder: `Select files to deploy to "${targetName}"`,
        items: fileChoicesInWorkspaceOrder(files, workspaceFolders),
    };
}

export function additionalFilesPrompt({
    files,
    workspaceFolders,
}: FoundFiles): ChoicePrompt<string> {
    return {
        id: "additionalFiles",
        placeholder: "Select additional files to include in the deployment",
        items: fileChoicesInWorkspaceOrder(files, workspaceFolders),
    };
}

export function deleteTargetConfirmation(name: string): ConfirmRequest {
    return confirmation({
        id: "deleteTarget",
        title: `Delete deployment target "${name}"?`,
        confirmLabel: "Delete",
        affected: [`Target "${name}" and its stored credentials will be removed.`],
    });
}

/**
 * The hosts lead and the connection follows in the details: a target name comes
 * from the shared file and must not be able to push the hosts out of sight.
 */
export function credentialApprovalConfirmation({
    connectionLabel,
    approved,
    unapproved,
}: {
    connectionLabel: string;
    approved: CredentialDestinations;
    unapproved: CredentialDestinations;
}): ConfirmRequest {
    return {
        id: "credentialApproval",
        title: `Send credentials and .env values to ${unapproved}?`,
        confirmLabel: "Send Credentials",
        details: [
            `They belong to ${connectionLabel}.`,
            approved.isEmpty()
                ? "No host is approved for them yet."
                : `Approved so far: ${approved}.`,
            "The shared deployment targets file and .env decide where they go. Continue only if you expect this host.",
        ],
    };
}
