import { PROJECT_SCOPES, ProjectScope } from "./projectScopes";
import { innermostFolderOf, relativeToRoot } from "./rootContainment";
import { lastWorkspacePathSegment } from "./workspacePath";

/**
 * A source the user turned off, or one template id (every version) within it.
 * A preference kept by the host for the user, not a trust decision.
 */
export interface TemplateSwitch {
    readonly source: string;
    readonly templateId?: string;
}

export interface TemplatePreferences {
    readonly disabled: readonly TemplateSwitch[];
}

export type TemplatePreferencesByScope = Readonly<Record<ProjectScope, TemplatePreferences>>;

export const NO_TEMPLATE_PREFERENCES: TemplatePreferencesByScope = {
    project: { disabled: [] },
    allProjects: { disabled: [] },
};

/**
 * A template source as the core places its switches: a key that survives a
 * moved repository, a renamed file and a new marketplace ref, and the one
 * scope its switches live in.
 */
export interface TemplateSourceRef {
    readonly key: string;
    readonly scope: ProjectScope;
}

/**
 * One write to one scope's list, merged by the host into the list it stores,
 * so a writer never drops a switch it had not read. Built only through
 * {@link templatePreferenceChange}.
 */
export interface TemplatePreferenceChange {
    readonly scope: ProjectScope;
    readonly disable: readonly TemplateSwitch[];
    readonly enable: readonly TemplateSwitch[];
}

/** Throws on a switch named twice: disabled twice, enabled twice, or both. */
export function templatePreferenceChange(
    scope: ProjectScope,
    disable: readonly TemplateSwitch[],
    enable: readonly TemplateSwitch[],
): TemplatePreferenceChange {
    const named = new Set<string>();
    for (const each of [...disable, ...enable]) {
        const key = switchKeyOf(each);
        if (named.has(key)) {
            throw new Error(`A template preference change names a switch twice: ${key}`);
        }
        named.add(key);
    }
    return { scope, disable: disable.map(switchOf), enable: enable.map(switchOf) };
}

/**
 * The stored list after `change`: switches it does not name keep their place,
 * every copy of an enabled one drops, a disabled one already stored stays
 * where its first copy is, and new ones append in the order the change names
 * them.
 */
export function templatePreferencesAfter(
    stored: TemplatePreferences,
    change: TemplatePreferenceChange,
): TemplatePreferences {
    const { disable, enable } = templatePreferenceChange(
        change.scope,
        change.disable,
        change.enable,
    );
    const enabled = new Set(enable.map(switchKeyOf));
    const pendingDisable = new Map(disable.map((each) => [switchKeyOf(each), each]));
    const disabledKeys = new Set(pendingDisable.keys());
    const kept = stored.disabled.flatMap((each): TemplateSwitch[] => {
        const key = switchKeyOf(each);
        if (enabled.has(key)) return [];
        if (!disabledKeys.has(key)) return [switchOf(each)];
        const first = pendingDisable.get(key);
        pendingDisable.delete(key);
        return first === undefined ? [] : [first];
    });
    return { disabled: [...kept, ...pendingDisable.values()] };
}

/** Equal for two lists of the same switches in any order. */
export function templatePreferencesKey(preferences: TemplatePreferences): string {
    return JSON.stringify(preferences.disabled.map(switchKeyOf).sort());
}

/** Equal for the same switches in each scope, in any order; never across scopes. */
export function templatePreferencesByScopeKey(preferences: TemplatePreferencesByScope): string {
    return JSON.stringify(
        PROJECT_SCOPES.map((scope) => templatePreferencesKey(preferences[scope])),
    );
}

/** A list as a host read it back from storage, every malformed switch left out. */
export function storedTemplatePreferencesOf(raw: unknown): TemplatePreferences {
    if (!isRecord(raw) || !Array.isArray(raw.disabled)) {
        return { disabled: [] };
    }
    return { disabled: raw.disabled.filter(isTemplateSwitch).map(switchOf) };
}

export function isTemplateSourceEnabled(
    source: TemplateSourceRef,
    preferences: TemplatePreferencesByScope,
): boolean {
    return !isSwitchedOff(sourceSwitchOf(source), source, preferences);
}

/**
 * Offered unless its source or its own switch in that source is off, read in
 * the source's own scope only: a row left in the other scope by a source that
 * moved never hides it.
 */
export function isTemplateOffered(
    templateId: string,
    source: TemplateSourceRef,
    preferences: TemplatePreferencesByScope,
): boolean {
    return (
        isTemplateSourceEnabled(source, preferences) &&
        !isSwitchedOff(templateSwitchOf(source, templateId), source, preferences)
    );
}

/** All projects when the source is registered for all projects, else the open project. */
export function templateSourceScopeOf(registeredIn: readonly ProjectScope[]): ProjectScope {
    return registeredIn.includes("allProjects") ? "allProjects" : "project";
}

/**
 * A config folder's switches live in the open project, keyed by the name of
 * the innermost workspace folder and the path below it, so they survive a
 * moved repository and a second root added beside it; a folder outside every
 * root keeps its full path.
 */
export function configFolderTemplateSourceOf(
    configFolderDir: string,
    workspaceFolders: readonly string[],
): TemplateSourceRef {
    return {
        key: `configFolder:${configFolderPlaceOf(configFolderDir, workspaceFolders)}`,
        scope: "project",
    };
}

export function sourceSwitchOf(source: TemplateSourceRef): TemplateSwitch {
    return { source: source.key };
}

export function templateSwitchOf(source: TemplateSourceRef, templateId: string): TemplateSwitch {
    return { source: source.key, templateId };
}

function configFolderPlaceOf(dir: string, folders: readonly string[]): string {
    const root = innermostFolderOf(dir, folders);
    if (root === undefined) {
        return dir;
    }
    const below = relativeToRoot(dir, root);
    const rootName = lastWorkspacePathSegment(root);
    return below ? `${rootName}/${below}` : rootName;
}

function isSwitchedOff(
    wanted: TemplateSwitch,
    source: TemplateSourceRef,
    preferences: TemplatePreferencesByScope,
): boolean {
    const key = switchKeyOf(wanted);
    return preferences[source.scope].disabled.some((each) => switchKeyOf(each) === key);
}

function switchKeyOf({ source, templateId }: TemplateSwitch): string {
    return JSON.stringify([source, templateId ?? null]);
}

function switchOf({ source, templateId }: TemplateSwitch): TemplateSwitch {
    return templateId === undefined ? { source } : { source, templateId };
}

function isTemplateSwitch(raw: unknown): raw is TemplateSwitch {
    return (
        isRecord(raw) &&
        typeof raw.source === "string" &&
        (raw.templateId === undefined || typeof raw.templateId === "string")
    );
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
    return typeof raw === "object" && raw !== null;
}
