import { ChoiceItem } from "./prompts";

export function fileChoice(_path: string): ChoiceItem<string> {
    return { label: "", value: "" };
}

export function fileChoicesInWorkspaceOrder(
    _paths: readonly string[],
    _workspaceFolders: readonly string[],
): ChoiceItem<string>[] {
    return [];
}
