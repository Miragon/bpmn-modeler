export interface LanguagePreferencePort {
    setLanguage(locale: string): PromiseLike<void>;
}
