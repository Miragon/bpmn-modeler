export type Translate = (template: string, replacements?: Record<string, string>) => string;

// Used when no TranslateModule is registered (third-party bpmn-js setups):
// echoes the template while still resolving {placeholders}, matching diagram-js.
export const fallbackTranslate: Translate = (template, replacements = {}) =>
    template.replace(/{([^}]+)}/g, (_, key: string) => replacements[key] ?? `{${key}}`);
