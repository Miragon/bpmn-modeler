import { DEFAULT_MODELER_SETTINGS } from "../../../kernel/domain/modelerSettings";

export class BpmnModelerSetting {
    constructor(
        public readonly alignToOrigin: boolean,
        public readonly showTransactionBoundaries: boolean,
        public readonly colorTheme: "automatic" | "light",
        public readonly favouriteBpmnElements: string[],
    ) {}
}

export class SettingBuilder {
    private _alignToOrigin = DEFAULT_MODELER_SETTINGS.alignToOrigin;

    private _showTransactionBoundaries = DEFAULT_MODELER_SETTINGS.showTransactionBoundaries;

    private _colorTheme = DEFAULT_MODELER_SETTINGS.colorTheme;

    private _favouriteBpmnElements = [...DEFAULT_MODELER_SETTINGS.favouriteBpmnElements];

    alignToOrigin(value: boolean): SettingBuilder {
        this._alignToOrigin = value;
        return this;
    }

    showTransactionBoundaries(value: boolean): SettingBuilder {
        this._showTransactionBoundaries = value;
        return this;
    }

    colorTheme(value: "automatic" | "light"): SettingBuilder {
        this._colorTheme = value;
        return this;
    }

    favouriteBpmnElements(value: string[]): SettingBuilder {
        this._favouriteBpmnElements = value;
        return this;
    }

    buildBpmnModeler(): BpmnModelerSetting {
        return new BpmnModelerSetting(
            this._alignToOrigin,
            this._showTransactionBoundaries,
            this._colorTheme,
            this._favouriteBpmnElements,
        );
    }
}
