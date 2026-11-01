import { catalogFor } from "@miragon/bpmn-modeler-element-template-builder";
import { ENGINE_LABEL, type Engine } from "@miragon/bpmn-modeler-types";

import type { TemplateChoice } from "./templateFile";

type Translate = (template: string, replacements?: Record<string, string>) => string;

/** The template editor's page: toolbar, messages, the builder and the preview on the right. */
export interface EditorView {
    readonly previewPanel: HTMLElement;
    readonly builderRoot: HTMLElement;
    showEngine(engine: Engine | undefined): void;
    showChoices(choices: readonly TemplateChoice[], selected: string | undefined): void;
    showMessages(messages: readonly string[]): void;
    /** Whether there is a template to preview; without one the preview column is left out. */
    showPreview(available: boolean): void;
    showMain(main: EditorMain): void;
    onSelect(listener: (key: string) => void): void;
    onCreate(listener: (engine: Engine, elementType: string, name: string) => void): void;
    onChooseEngine(listener: (engine: Engine) => void): void;
    /** Sets the page's own texts again, in the language now chosen. */
    relabel(): void;
}

/** The builder, the new-template wizard, the engine choice, or a note while nothing can be built. */
export type EditorMain = "builder" | "wizard" | "engineChoice" | "placeholder";

const ENGINES: readonly Engine[] = ["c8", "c7"];

// Template names come from the edited file, so text is only ever set, never parsed as HTML.
export function mountEditorView(root: HTMLElement, translate: Translate): EditorView {
    const doc = root.ownerDocument;
    const element = <K extends keyof HTMLElementTagNameMap>(
        tag: K,
        className: string,
        text?: string,
    ): HTMLElementTagNameMap[K] => {
        const node = doc.createElement(tag);
        node.className = className;
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    };

    const relabels: (() => void)[] = [];
    // The language usually arrives after the page is built, so each text can be set again.
    const label = (apply: () => void) => {
        apply();
        relabels.push(apply);
    };

    const container = element("div", "template-editor");
    const toolbar = element("div", "template-editor__toolbar");
    const engineBadge = element("span", "template-editor__engine");
    engineBadge.hidden = true;
    const choice = element("select", "template-editor__choice");
    label(() => choice.setAttribute("aria-label", translate("Template")));
    choice.hidden = true;
    const messages = element("div", "template-editor__messages");
    messages.setAttribute("role", "status");

    const body = element("div", "template-editor__body");
    // The ids and classes of the modelers' properties panel, so the shared resizer and its look apply.
    const resizer = element("div", "panel-resizer");
    resizer.id = "js-panel-resizer";
    const previewPane = element("aside", "properties-panel-parent template-editor__preview");
    previewPane.id = "js-properties-panel";
    label(() => previewPane.setAttribute("aria-label", translate("Preview")));
    const previewPanel = element("div", "template-editor__preview-mount");
    const previewTitle = element("div", "template-editor__preview-title");
    label(() => {
        previewTitle.textContent = translate("Preview");
        previewTitle.title = translate(
            "The template as the properties panel shows it. Values entered here are not saved.",
        );
    });
    previewPane.append(previewTitle, previewPanel);
    const main = element("main", "template-editor__main");
    const builderRoot = element("div", "template-editor__builder");

    const wizard = element("form", "template-editor__wizard");
    const wizardTitle = element("h2", "template-editor__wizard-title");
    label(() => (wizardTitle.textContent = translate("Create an element template")));
    const wizardLead = element("p", "template-editor__lead");
    label(
        () =>
            (wizardLead.textContent = translate(
                "Pick the engine and the element the template is for. You can change both later.",
            )),
    );
    const engineSelect = element("select", "template-editor__wizard-engine");
    for (const engine of ENGINES) {
        const option = element("option", "", ENGINE_LABEL[engine]);
        option.value = engine;
        engineSelect.append(option);
    }
    const elementTypeSelect = element("select", "template-editor__wizard-element-type");
    const nameInput = element("input", "template-editor__wizard-name");
    nameInput.required = true;
    label(() => (nameInput.placeholder = translate("For example: Send mail")));
    const createButton = element("button", "template-editor__wizard-create");
    label(() => (createButton.textContent = translate("Create template")));
    createButton.type = "submit";
    const labelled = (key: string, field: HTMLElement) => {
        const caption = element("span", "");
        label(() => (caption.textContent = translate(key)));
        const wrapper = element("label", "template-editor__wizard-field");
        wrapper.append(caption, field);
        return wrapper;
    };
    wizard.append(
        wizardTitle,
        wizardLead,
        labelled("Engine", engineSelect),
        labelled("Applies to", elementTypeSelect),
        labelled("Name", nameInput),
        createButton,
    );
    const fillElementTypes = () => {
        elementTypeSelect.replaceChildren(
            ...catalogFor(engineSelect.value as Engine).elementTypes.map((type) => {
                const option = element("option", "", type);
                option.value = type;
                return option;
            }),
        );
    };
    engineSelect.addEventListener("change", fillElementTypes);
    fillElementTypes();

    const engineChoice = element("div", "template-editor__engine-choice");
    const engineButtons = element("div", "template-editor__engine-buttons");
    engineButtons.append(
        ...ENGINES.map((engine) => {
            const button = element(
                "button",
                "template-editor__engine-button",
                ENGINE_LABEL[engine],
            );
            button.type = "button";
            button.dataset.engine = engine;
            return button;
        }),
    );
    const engineTitle = element("h2", "template-editor__wizard-title");
    label(() => (engineTitle.textContent = translate("Which engine is this template for?")));
    const engineLead = element("p", "template-editor__lead");
    label(
        () =>
            (engineLead.textContent = translate(
                'The engine decides which bindings the template can use. Your choice is saved as its "$schema".',
            )),
    );
    engineChoice.append(engineTitle, engineLead, engineButtons);
    const placeholder = element("p", "template-editor__placeholder");
    label(
        () =>
            (placeholder.textContent = translate(
                "The builder opens once the file holds a valid element template.",
            )),
    );

    // Nothing shows until the first file arrives.
    for (const view of [builderRoot, wizard, engineChoice, placeholder]) {
        view.hidden = true;
    }
    main.append(builderRoot, wizard, engineChoice, placeholder);
    body.append(main, resizer, previewPane);
    toolbar.append(engineBadge, choice);
    // An empty toolbar would only be a stray line above the wizard.
    const fitToolbar = () => {
        toolbar.hidden = engineBadge.hidden && choice.hidden;
    };
    fitToolbar();
    container.append(toolbar, messages, body);
    root.replaceChildren(container);

    return {
        previewPanel,
        builderRoot,
        showEngine(engine) {
            engineBadge.textContent = engine ? ENGINE_LABEL[engine] : "";
            engineBadge.hidden = !engine;
            fitToolbar();
        },
        showChoices(choices, selected) {
            choice.replaceChildren(
                ...choices.map(({ key, label }) => {
                    const option = element("option", "", label);
                    option.value = key;
                    return option;
                }),
            );
            choice.value = selected ?? "";
            choice.hidden = choices.length < 2;
            fitToolbar();
        },
        showMessages(lines) {
            messages.replaceChildren(...lines.map((line) => element("p", "", line)));
            messages.hidden = lines.length === 0;
        },
        showPreview(available) {
            container.classList.toggle("template-editor--no-preview", !available);
        },
        showMain(shown) {
            const opensWizard = shown === "wizard" && wizard.hidden;
            builderRoot.hidden = shown !== "builder";
            wizard.hidden = shown !== "wizard";
            engineChoice.hidden = shown !== "engineChoice";
            placeholder.hidden = shown !== "placeholder";
            if (opensWizard) {
                nameInput.focus({ preventScroll: true });
            }
        },
        onSelect(listener) {
            choice.addEventListener("change", () => listener(choice.value));
        },
        onCreate(listener) {
            wizard.addEventListener("submit", (event) => {
                event.preventDefault();
                const name = nameInput.value.trim();
                if (name !== "") {
                    listener(engineSelect.value as Engine, elementTypeSelect.value, name);
                }
            });
        },
        relabel() {
            relabels.forEach((apply) => apply());
        },
        onChooseEngine(listener) {
            engineChoice.addEventListener("click", (event) => {
                const engine = (event.target as HTMLElement).dataset?.engine;
                if (engine === "c7" || engine === "c8") {
                    listener(engine);
                }
            });
        },
    };
}
