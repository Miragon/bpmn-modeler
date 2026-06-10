import { Disposable } from "vscode";

const disposables: Map<string, Disposable[]> = new Map();

export function addToDisposals(editorId: string, disposable: Disposable) {
    const subscriptions = disposables.get(editorId);

    if (subscriptions) {
        subscriptions.push(disposable);
    } else {
        disposables.set(editorId, [disposable]);
    }
}

export function getDisposables(editorId: string): Disposable[] {
    return disposables.get(editorId) ?? [];
}

export function clearDisposables(editorId: string) {
    disposables.delete(editorId);
}

export class NoChangesToApplyError extends Error {
    constructor(editorId: string) {
        super(`No changes to apply for ${editorId}.`);
    }
}
