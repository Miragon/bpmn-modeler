import {
    detectTemplateEngine,
    type ElementTemplate,
    type Engine,
    templatesOfFile,
} from "@miragon/bpmn-modeler-types";

export interface TemplateChoice {
    /** Where the template sits in the file. */
    position: number;
    /** Stable as long as the template keeps its id and version, wherever it moves. */
    key: string;
    label: string;
}

/**
 * The template to stay on. Without a `key`, only its place in the file counts:
 * the page's own edits never move a template, and they can change its key.
 */
export interface TemplateSelection {
    position: number;
    key?: string;
}

/** Where the selected template sits in the file: `[]` for a single one, `[index]` in an array. */
type TemplatePath = [] | [number];

export type TemplateFileState =
    | { kind: "empty" }
    | { kind: "invalidJson"; message: string }
    | { kind: "notATemplate" }
    | {
          kind: "unknownEngine";
          choices: TemplateChoice[];
          selected: TemplateChoice;
          path: TemplatePath;
      }
    | {
          kind: "template";
          template: ElementTemplate;
          engine: Engine;
          choices: TemplateChoice[];
          selected: TemplateChoice;
          path: TemplatePath;
      };

/** What the editor shows for a file's text, staying on `selection` while it can. */
export function readTemplateFile(text: string, selection?: TemplateSelection): TemplateFileState {
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
    const choices = entries.map(({ template, position }) => choiceOf(template, position));
    const index = selectedIndex(choices, selection);
    const template = templates[index];
    const selected = choices[index];
    const path: TemplatePath = Array.isArray(parsed) ? [selected.position] : [];
    const engine = detectTemplateEngine(template) ?? detectTemplateEngine(templates);
    return engine
        ? { kind: "template", template, engine, choices, selected, path }
        : { kind: "unknownEngine", choices, selected, path };
}

function isTemplateObject(value: unknown): value is ElementTemplate {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The template itself if it stayed, else where it moved, else whatever now sits at its place. */
function selectedIndex(
    choices: readonly TemplateChoice[],
    selection: TemplateSelection | undefined,
): number {
    if (!selection) {
        return 0;
    }
    const { position, key } = selection;
    const atPosition = choices.findIndex((choice) => choice.position === position);
    if (key !== undefined && choices[atPosition]?.key !== key) {
        const moved = choices.findIndex((choice) => choice.key === key);
        if (moved !== -1) {
            return moved;
        }
    }
    return atPosition !== -1 ? atPosition : choices.length - 1;
}

function choiceOf(template: ElementTemplate, position: number): TemplateChoice {
    const { id, name, version } = template;
    const key = typeof id === "string" ? `${id}@${version ?? ""}` : `#${position}`;
    const title =
        typeof name === "string" ? name : typeof id === "string" ? id : `Template ${position + 1}`;
    return {
        position,
        key,
        label: version === undefined ? title : `${title} (v${String(version)})`,
    };
}
