/** bpmn-js's `translate` service, which fills a template's `{placeholders}` from `replacements`. */
export type Translate = (template: string, replacements?: Record<string, string>) => string;
