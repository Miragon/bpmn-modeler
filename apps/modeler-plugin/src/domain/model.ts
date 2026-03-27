/**
 * Value object representing the current BPMN modeler display settings.
 */
export class BpmnModelerSetting {
    constructor(
        public readonly alignToOrigin: boolean,
        public readonly showTransactionBoundaries: boolean,
        public readonly colorTheme: "automatic" | "light",
        public readonly favouriteBpmnElements: string[],
    ) {}
}

/**
 * Fluent builder for {@link BpmnModelerSetting}.
 */
export class SettingBuilder {
    private _alignToOrigin = false;

    private _showTransactionBoundaries = true;

    private _colorTheme: "automatic" | "light" = "automatic";

    private _favouriteBpmnElements: string[] = [];

    /** Sets the alignToOrigin flag. */
    alignToOrigin(value: boolean): SettingBuilder {
        this._alignToOrigin = value;
        return this;
    }

    /** Sets the showTransactionBoundaries flag. */
    showTransactionBoundaries(value: boolean): SettingBuilder {
        this._showTransactionBoundaries = value;
        return this;
    }

    /** Sets the color theme mode. */
    colorTheme(value: "automatic" | "light"): SettingBuilder {
        this._colorTheme = value;
        return this;
    }

    /** Sets the favourite BPMN element types for the append menu palette. */
    favouriteBpmnElements(value: string[]): SettingBuilder {
        this._favouriteBpmnElements = value;
        return this;
    }

    /** Builds and returns a {@link BpmnModelerSetting} instance. */
    buildBpmnModeler(): BpmnModelerSetting {
        return new BpmnModelerSetting(
            this._alignToOrigin,
            this._showTransactionBoundaries,
            this._colorTheme,
            this._favouriteBpmnElements,
        );
    }
}
