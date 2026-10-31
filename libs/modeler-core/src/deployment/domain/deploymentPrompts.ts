import { posix } from "path";

import { confirmation } from "../../kernel/domain/affectedItems";
import { ChoiceItem, ChoicePrompt, ConfirmRequest } from "../../kernel/domain/prompts";
import { CredentialDestinations } from "./credentialDestinations";
import { DeploymentTarget } from "./deploymentTarget";

export type DeploymentStatusAction = "switch" | "verify";

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
    activeTarget: Pick<DeploymentTarget, "name" | "engine"> | undefined,
): ChoicePrompt<DeploymentStatusAction> {
    const items: ChoiceItem<DeploymentStatusAction>[] = [
        { label: "Switch deployment target…", icon: "swap", value: "switch" },
    ];
    if (activeTarget?.engine === "c7") {
        items.push({ label: `Verify on ${activeTarget.name}`, icon: "cloud", value: "verify" });
    }
    return {
        id: "deploymentStatusAction",
        placeholder: activeTarget
            ? `Deployment target "${activeTarget.name}"`
            : "No deployment target selected",
        items,
    };
}

/** What a workspace search found, and the folders it searched. */
export interface FoundFiles {
    readonly files: readonly string[];
    readonly workspaceFolders: readonly string[];
}

export function deployableFilesPrompt({
    targetName,
    files,
}: FoundFiles & { readonly targetName: string }): ChoicePrompt<string> {
    return {
        id: "deployableFiles",
        placeholder: `Select files to deploy to "${targetName}"`,
        items: files.map(fileChoice),
    };
}

export function additionalFilesPrompt({ files }: FoundFiles): ChoicePrompt<string> {
    return {
        id: "additionalFiles",
        placeholder: "Select additional files to include in the deployment",
        items: files.map(fileChoice),
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

function fileChoice(path: string): ChoiceItem<string> {
    return { label: posix.basename(path), path, value: path };
}
