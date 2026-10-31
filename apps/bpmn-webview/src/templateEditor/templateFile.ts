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

export type TemplateFileState =
    | { kind: "empty" }
    | { kind: "invalidJson"; message: string }
    | { kind: "notATemplate" }
    | { kind: "unknownEngine"; choices: TemplateChoice[]; selected: string }
    | {
          kind: "template";
          template: ElementTemplate;
          engine: Engine;
          choices: TemplateChoice[];
          selected: string;
      };

/** What the preview shows for a file's text, keeping `selectedKey` while it still exists. */
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

    const templates = templatesOfFile(parsed).filter(isTemplateObject);
    if (templates.length === 0) {
        return { kind: "notATemplate" };
    }
    const choices = templates.map(choiceOf);
    const index = Math.max(
        choices.findIndex((choice) => choice.key === selectedKey),
        0,
    );
    const template = templates[index];
    const selected = choices[index].key;
    const engine = detectTemplateEngine(template) ?? detectTemplateEngine(templates);
    return engine
        ? { kind: "template", template, engine, choices, selected }
        : { kind: "unknownEngine", choices, selected };
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
