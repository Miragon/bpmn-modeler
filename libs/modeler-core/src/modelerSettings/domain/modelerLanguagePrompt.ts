import { ChoicePrompt } from "../../kernel/domain/prompts";

export function modelerLanguagePrompt(
    languages: readonly { readonly label: string; readonly locale: string }[],
): ChoicePrompt<string> {
    return {
        id: "modelerLanguage",
        title: "Change Modeler Language",
        placeholder: "Select the modeler UI language",
        items: languages.map(({ label, locale }) => ({
            label,
            description: locale,
            value: locale,
        })),
    };
}
