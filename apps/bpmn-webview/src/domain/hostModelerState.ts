import type {
    BpmnModelerSetting,
    ElementIdConventionOptions,
    ElementIdSettings,
    OpenScriptEditorRef,
} from "@miragon/bpmn-modeler-types";

interface SettingsTarget {
    setSettings(settings: BpmnModelerSetting): void;
}

interface DesignerSettingsTarget {
    setFavouriteBpmnElements(types: readonly string[]): void;
    setElementIdSettings(settings: Partial<ElementIdSettings>): void;
}

interface OpenScriptEditorsTarget {
    applyOpenScriptEditors(refs: OpenScriptEditorRef[]): void;
}

export function elementIdSettingsOf(
    settings: BpmnModelerSetting | undefined,
): Partial<ElementIdSettings> {
    return { followName: settings?.elementIdsFollowName };
}

/** Of the host settings, the designer honours the favourites and the element ID settings. */
export function applyDesignerSettings(
    settings: BpmnModelerSetting,
    designer: DesignerSettingsTarget,
): void {
    if (settings.favouriteBpmnElements) {
        designer.setFavouriteBpmnElements(settings.favouriteBpmnElements);
    }
    designer.setElementIdSettings(elementIdSettingsOf(settings));
}

/**
 * The host sends settings and open script editors only on load and on change,
 * so a modeler or designer a mode switch builds later has to be handed the last
 * known values.
 */
export class HostModelerState {
    private latestSettings: BpmnModelerSetting | undefined;
    private latestConventionOptions: ElementIdConventionOptions | undefined;
    private latestOpenScripts: OpenScriptEditorRef[] | undefined;

    get settings(): BpmnModelerSetting | undefined {
        return this.latestSettings;
    }

    rememberSettings(settings: BpmnModelerSetting): void {
        this.latestSettings = settings;
    }

    /** The options the document's lint config gives `element-id-naming`; none until the host sent them. */
    get elementIdConventionOptions(): ElementIdConventionOptions | undefined {
        return this.latestConventionOptions;
    }

    rememberElementIdConvention(options: ElementIdConventionOptions): void {
        this.latestConventionOptions = options;
    }

    rememberOpenScripts(openScripts: OpenScriptEditorRef[]): void {
        this.latestOpenScripts = openScripts;
    }

    applySettingsPushedSince(
        builtWith: BpmnModelerSetting | undefined,
        modeler: SettingsTarget,
    ): void {
        if (this.latestSettings && this.latestSettings !== builtWith) {
            modeler.setSettings(this.latestSettings);
        }
    }

    applyDesignerSettingsPushedSince(
        builtWith: BpmnModelerSetting | undefined,
        designer: DesignerSettingsTarget,
    ): void {
        if (this.latestSettings && this.latestSettings !== builtWith) {
            applyDesignerSettings(this.latestSettings, designer);
        }
    }

    restoreOpenScripts(modeler: OpenScriptEditorsTarget): void {
        if (this.latestOpenScripts) {
            modeler.applyOpenScriptEditors(this.latestOpenScripts);
        }
    }
}
