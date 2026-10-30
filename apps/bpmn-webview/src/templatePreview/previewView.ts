import { i18n } from "@miragon/bpmn-modeler-i18n";
import { ENGINE_LABEL, type Engine } from "@miragon/bpmn-modeler-types";

import type { TemplateChoice } from "./templateFile";

/** The preview page's chrome around the properties panel. */
export interface PreviewView {
    readonly panel: HTMLElement;
    showEngine(engine: Engine | undefined): void;
    showChoices(choices: readonly TemplateChoice[], selected: string | undefined): void;
    showMessages(messages: readonly string[]): void;
    onSelect(listener: (key: string) => void): void;
}

// Template names come from the edited file, so text is only ever set, never parsed as HTML.
export function mountPreviewView(root: HTMLElement): PreviewView {
    const doc = root.ownerDocument;
    const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
        const node = doc.createElement(tag);
        node.className = className;
        return node;
    };

    const container = element("div", "template-preview");
    const toolbar = element("div", "template-preview__toolbar");
    const engineBadge = element("span", "template-preview__engine");
    const choice = element("select", "template-preview__choice");
    choice.setAttribute("aria-label", i18n.translate("Template"));
    const messages = element("div", "template-preview__messages");
    messages.setAttribute("role", "status");
    const panel = element("div", "template-preview__panel");

    toolbar.append(engineBadge, choice);
    container.append(toolbar, messages, panel);
    root.replaceChildren(container);

    return {
        panel,
        showEngine(engine) {
            engineBadge.textContent = engine ? ENGINE_LABEL[engine] : "";
            engineBadge.hidden = !engine;
        },
        showChoices(choices, selected) {
            choice.replaceChildren(
                ...choices.map(({ key, label }) => {
                    const option = doc.createElement("option");
                    option.value = key;
                    option.textContent = label;
                    return option;
                }),
            );
            choice.value = selected ?? "";
            choice.hidden = choices.length < 2;
        },
        showMessages(lines) {
            messages.replaceChildren(
                ...lines.map((line) => {
                    const paragraph = doc.createElement("p");
                    paragraph.textContent = line;
                    return paragraph;
                }),
            );
            messages.hidden = lines.length === 0;
        },
        onSelect(listener) {
            choice.addEventListener("change", () => listener(choice.value));
        },
    };
}
