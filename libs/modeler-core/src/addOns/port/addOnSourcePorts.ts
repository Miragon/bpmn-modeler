import {
    ApprovableArtifact,
    CodeApproval,
    ListedPresence,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import { SettingChange } from "../../editorSession/domain/EditorSession";

/**
 * What every owner of approvable code gives the catalog. The owners keep the
 * rules: they find, hash and answer for their code, and the catalog only
 * lists what they read.
 */
export interface CodeAddOnSource {
    /** Its rows in the one approval list every kind shares. */
    ownsApproval(approval: CodeApproval): boolean;
    /** By `declineKeyOf`. */
    sessionAnswers(): ReadonlyMap<string, SessionAnswer>;
    /** No notice asks about this content again this session. */
    leaveForView(artifact: ApprovableArtifact): void;
    /** Read and hashed now, past any memo. */
    current(id: string): Promise<ListedPresence>;
    /** After the catalog revoked one of its rows. */
    afterRevoke(): Promise<void>;
    /** After anything it lists or answered changed. */
    onDidChange(listener: () => void): { dispose(): void };
}

export interface PluginAddOnSource extends CodeAddOnSource {
    pluginsIn(pluginDirs: readonly string[]): Promise<readonly ListedPresence[]>;
    /** The plugins folders an editor or a listing looked in, nested config folders included. */
    knownPluginDirs(): readonly string[];
    /** Where a folder's own config folder keeps its plugins. */
    pluginsDirOf(dir: string, configFolder: string): string;
    /** The config folder a plugin comes from, which the catalog lists it under. */
    configFolderOf(pluginId: string): string;
    pruneCache(): Promise<{ readonly removed: number }>;
}

export interface RulePackageAddOnSource extends CodeAddOnSource {
    /** The rule packages installed in each folder's `node_modules`. */
    installedIn(dirs: readonly string[]): readonly string[];
    /** The folder the catalog lists a package under. */
    sourceDirOf(id: string): string;
    /** The packages a lint reported, the config's own package included. */
    seenPackageIds(): readonly string[];
    lintConfigDirs(): readonly string[];
    /** Hashing reads every byte of the package and its dependencies, so only on request. */
    currentRulePackage(id: string, options: { readonly hash: boolean }): ListedPresence;
    revokedThisSession(): ReadonlySet<string>;
}

export interface SettingChanges {
    onDidChange(listener: (change: SettingChange) => void): { dispose(): void };
}
