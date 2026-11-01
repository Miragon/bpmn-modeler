import {
    detectTemplateEngine,
    type ElementTemplate,
    type Engine,
    templatesOfFile,
} from "@miragon/bpmn-modeler-types";

export interface TemplateChoice {
    /** Stable across edits as long as the template keeps its id and version. */
    key: string;
    label: string;
}

/** Where the selected template sits in the file: `[]` for a single one, `[index]` in an array. */
type TemplatePath = [] | [number];

export type TemplateFileState =
    | { kind: "empty" }
    | { kind: "invalidJson"; message: string }
    | { kind: "notATemplate" }
    | { kind: "unknownEngine"; choices: TemplateChoice[]; selected: string; path: TemplatePath }
    | {
          kind: "template";
          template: ElementTemplate;
          engine: Engine;
          choices: TemplateChoice[];
          selected: string;
          path: TemplatePath;
      };

/** What the editor shows for a file's text, keeping `selectedKey` while it still exists. */
export function readTemplateFile(text: string, selectedKey?: string): TemplateFileState {
    if (text.trim() === "") {
        return { kind: "empty" };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return { kind: "invalidJson", message: (error as Error).message };
    }

    const entries = templatesOfFile(parsed).flatMap((template, position) =>
        isTemplateObject(template) ? [{ template, position }] : [],
    );
    if (entries.length === 0) {
        return { kind: "notATemplate" };
    }
    const templates = entries.map(({ template }) => template);
    const choices = templates.map(choiceOf);
    const index = Math.max(
        choices.findIndex((choice) => choice.key === selectedKey),
        0,
    );
    const template = templates[index];
    const selected = choices[index].key;
    const path: TemplatePath = Array.isArray(parsed) ? [entries[index].position] : [];
    const engine = detectTemplateEngine(template) ?? detectTemplateEngine(templates);
    return engine
        ? { kind: "template", template, engine, choices, selected, path }
        : { kind: "unknownEngine", choices, selected, path };
}

function isTemplateObject(value: unknown): value is ElementTemplate {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function choiceOf(template: ElementTemplate, index: number): TemplateChoice {
    const { id, name, version } = template;
    const key = typeof id === "string" ? `${id}@${version ?? ""}` : `#${index}`;
    const title =
        typeof name === "string" ? name : typeof id === "string" ? id : `Template ${index + 1}`;
    return { key, label: version === undefined ? title : `${title} (v${String(version)})` };
}
