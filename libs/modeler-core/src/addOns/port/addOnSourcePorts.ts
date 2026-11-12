import { AllowableCode } from "../../kernel/domain/allowance";
import { ApprovableCodeTexts, SessionAnswer } from "../../kernel/domain/codeApproval";
import { ListedPresence } from "../../kernel/domain/listedCode";
import { SettingChange } from "../../editorSession/domain/EditorSession";
import { MarketplacesListing } from "../../kernel/domain/marketplaceListing";
import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import {
    FolderTemplateFileListing,
    TemplateFileListing,
} from "../../kernel/domain/templateListing";

/**
 * What every owner of allowable code gives the catalog. The owners keep the
 * rules: they find, locate and answer for their code, and the catalog only
 * lists what they read.
 */
export interface CodeAddOnSource {
    readonly texts: ApprovableCodeTexts;
    /** By `allowanceKeyOf`. */
    sessionAnswers(): ReadonlyMap<string, SessionAnswer>;
    /** No notice asks about this allowance again this session. */
    leaveForView(code: AllowableCode): void;
    /** Read and located now, past any memo. */
    current(id: string): Promise<ListedPresence>;
    /** Revoked this session, with code that may still be loaded although no allowance covers it. */
    stillLoadedAfterRevoke(): ReadonlySet<string>;
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
    currentRulePackage(id: string): ListedPresence;
}

/** The element templates as their owner reads them: per file, by the loader's rule. */
export interface TemplateAddOnSource {
    /** The templates folders the open editors loaded, nested config folders included. */
    knownTemplateDirs(): readonly string[];
    /** Where a folder's own config folder keeps its templates. */
    templatesDirOf(dir: string, configFolder: string): string;
    templatesIn(templatesDirs: readonly string[]): Promise<readonly FolderTemplateFileListing[]>;
    templatesOf(files: readonly string[]): Promise<readonly TemplateFileListing[]>;
    /** After the templates folders the open editors loaded changed. */
    onDidChange(listener: () => void): { dispose(): void };
}

/** The registered marketplaces and the flows that change them, which ask and report on their own. */
export interface MarketplaceAddOnSource {
    /** Logs and says why when the registrations cannot be read. */
    listMarketplaces(): Promise<MarketplacesListing>;
    add(): Promise<void>;
    update(): Promise<void>;
    remove(entry: MarketplaceSettingsEntry): Promise<void>;
    /** After each flow that ran. */
    onDidChange(listener: () => void): { dispose(): void };
}

export interface SettingChanges {
    onDidChange(listener: (change: SettingChange) => void): { dispose(): void };
}
