import { SettingKey } from "../../kernel/domain/modelerSettings";

/**
 * The event shapes an editor session's subscriptions emit. The session itself,
 * `EditorHandle`, sits in `service/` because it speaks the webview protocol.
 */

/**
 * A cancellable subscription. Structurally compatible with `vscode.Disposable`
 * so a VS Code adapter can return its disposables directly, while the domain
 * never names the `vscode` type.
 */
export interface EditorSubscription {
    dispose(): void;
}

/** A change of one or more modeler settings, named by key the same way on every host. */
export interface SettingChange {
    affects(key: SettingKey): boolean;
}

/** A change that affects exactly the keys it names. */
export function settingChangeNaming(named: readonly SettingKey[]): SettingChange {
    const namedKeys: ReadonlySet<SettingKey> = new Set(named);
    return { affects: (key) => namedKeys.has(key) };
}

/**
 * Document-change event, narrowed to what the editor controllers actually read
 * (was `vscode.TextDocumentChangeEvent`). Keeps the callback host-agnostic.
 */
export interface DocumentChangeEvent {
    hasContentChanges(): boolean;
    documentUriString(): string;
    documentPath(): string;
}
