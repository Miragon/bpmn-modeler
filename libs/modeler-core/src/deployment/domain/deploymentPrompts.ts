import { ChoicePrompt, ConfirmRequest } from "../../kernel/domain/prompts";
import { CredentialDestinations } from "./credentialDestinations";
import { DeploymentTarget } from "./deploymentTarget";

export type DeploymentStatusAction = "switch" | "verify";

export function payloadFilePrompt(_paths: readonly string[]): ChoicePrompt<string> {
    return { id: "", placeholder: "", items: [] };
}

export function deploymentTargetPrompt(_names: readonly string[]): ChoicePrompt<string> {
    return { id: "", placeholder: "", items: [] };
}

export function deploymentStatusActionPrompt(
    _activeTarget: Pick<DeploymentTarget, "name" | "engine"> | undefined,
): ChoicePrompt<DeploymentStatusAction> {
    return { id: "", placeholder: "", items: [] };
}

export function deployableFilesPrompt(
    _targetName: string,
    _paths: readonly string[],
): ChoicePrompt<string> {
    return { id: "", placeholder: "", items: [] };
}

export function additionalFilesPrompt(_paths: readonly string[]): ChoicePrompt<string> {
    return { id: "", placeholder: "", items: [] };
}

export function deleteTargetConfirmation(_name: string): ConfirmRequest {
    return { id: "", title: "", confirmLabel: "", details: [] };
}

export function credentialApprovalConfirmation(_request: {
    connectionLabel: string;
    approved: CredentialDestinations;
    unapproved: CredentialDestinations;
}): ConfirmRequest {
    return { id: "", title: "", confirmLabel: "", details: [] };
}
