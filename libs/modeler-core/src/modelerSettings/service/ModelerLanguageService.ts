import { supportedModelerLanguages } from "@miragon/bpmn-modeler-i18n-extras";
import { NotifierPort, PickerPort } from "../../kernel/port/hostPorts";
import { modelerLanguagePrompt } from "../domain/modelerLanguagePrompt";
import { LanguagePreferencePort } from "../port/LanguagePreferencePort";

export class ModelerLanguageService {
    constructor(
        private readonly picker: PickerPort,
        private readonly preference: LanguagePreferencePort,
        private readonly notifier: NotifierPort,
    ) {}

    async changeLanguage(): Promise<void> {
        const locale = await this.picker.choose(modelerLanguagePrompt(supportedModelerLanguages));
        if (locale === undefined) return;
        await this.preference.setLanguage(locale);
        this.notifier.logInfo(`Modeler language changed to ${locale}`);
    }
}
