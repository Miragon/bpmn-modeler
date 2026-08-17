import { i18n } from "@miragon/bpmn-modeler-i18n";

/** A bpmnlint finding flattened for rendering in the problems panel. */
export interface ProblemsPanelIssue {
    /** Present only when the finding can navigate to a visible diagram element. */
    readonly elementId?: string;
    readonly elementLabel?: string;
    readonly message: string;
    readonly severity: "error" | "warn" | "info";
    readonly rule: string;
}

export interface ProblemsPanelCallbacks {
    onSelectIssue(elementId: string): void;
    onToggleOverlays(visible: boolean): void;
    onResize(): void;
}

const ICONS = {
    error: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm2.83 9.13-.7.7L8 8.7l-2.13 2.13-.7-.7L7.3 8 5.17 5.87l.7-.7L8 7.3l2.13-2.13.7.7L8.7 8l2.13 2.13z"/></svg>',
    warn: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8.56 1.45 15.5 13.5a.65.65 0 0 1-.56.97H1.06a.65.65 0 0 1-.56-.97L7.44 1.45a.65.65 0 0 1 1.12 0zM7.35 6v4h1.3V6h-1.3zm0 5.3v1.4h1.3v-1.4h-1.3z"/></svg>',
    info: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.7 10.5H7.3V7h1.4v4.5zm0-6H7.3V4.1h1.4v1.4z"/></svg>',
    success:
        '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M6.3 12.3 2.5 8.5l1-1 2.8 2.8 6.2-6.2 1 1z"/></svg>',
    eye: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 3.5c-3.2 0-5.8 2.4-6.8 4.5 1 2.1 3.6 4.5 6.8 4.5s5.8-2.4 6.8-4.5c-1-2.1-3.6-4.5-6.8-4.5zm0 7.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-4.7a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z"/></svg>',
    chevron:
        '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4z"/></svg>',
} as const;

function makeElement(tag: string, className: string): HTMLElement {
    const element = document.createElement(tag);
    element.className = className;
    return element;
}

let nextPanelId = 0;

/**
 * Full-width problems view docked below the BPMN canvas.
 *
 * Expanding the list is intentionally independent from showing the in-canvas
 * markers; the eye button is the only control that changes marker visibility.
 */
export class ProblemsPanel {
    private readonly root: HTMLElement;

    private readonly toggleButton: HTMLButtonElement;

    private readonly title: HTMLElement;

    private readonly badges: HTMLElement;

    private readonly overlaysButton: HTMLButtonElement;

    private readonly body: HTMLElement;

    private issues: ProblemsPanelIssue[] = [];

    private expanded = false;

    private overlaysVisible: boolean;

    constructor(
        parent: HTMLElement,
        private readonly callbacks: ProblemsPanelCallbacks,
        initialOverlaysVisible = true,
    ) {
        this.overlaysVisible = initialOverlaysVisible;
        this.root = makeElement("section", "lint-problems");

        const header = makeElement("div", "lint-problems__header");
        this.root.append(header);

        this.toggleButton = makeElement("button", "lint-problems__toggle") as HTMLButtonElement;
        this.toggleButton.type = "button";
        this.toggleButton.setAttribute("aria-expanded", "false");
        this.toggleButton.addEventListener("click", () => this.setExpanded(!this.expanded));
        header.append(this.toggleButton);

        const chevron = makeElement("span", "lint-problems__chevron");
        chevron.innerHTML = ICONS.chevron;
        this.title = makeElement("span", "lint-problems__title");
        this.badges = makeElement("span", "lint-problems__badges");
        this.badges.setAttribute("aria-live", "polite");
        this.toggleButton.append(chevron, this.title, this.badges);

        this.overlaysButton = makeElement("button", "lint-problems__overlays") as HTMLButtonElement;
        this.overlaysButton.type = "button";
        this.overlaysButton.innerHTML = ICONS.eye;
        this.overlaysButton.addEventListener("click", () => {
            this.setOverlaysVisible(!this.overlaysVisible);
            this.callbacks.onToggleOverlays(this.overlaysVisible);
        });
        header.append(this.overlaysButton);

        this.body = makeElement("div", "lint-problems__body");
        this.body.id = `lint-problems-body-${++nextPanelId}`;
        this.body.hidden = true;
        this.toggleButton.setAttribute("aria-controls", this.body.id);
        this.root.append(this.body);
        parent.append(this.root);

        this.renderLabels();
        i18n.onChange(() => this.renderLabels());
    }

    update(issues: ProblemsPanelIssue[]): void {
        this.issues = issues;
        const wasVisible = this.root.classList.contains("lint-problems--visible");
        this.root.classList.add("lint-problems--visible");
        this.renderBadges();
        this.renderList();
        if (!wasVisible || this.expanded) {
            this.callbacks.onResize();
        }
    }

    hide(): void {
        if (!this.root.classList.contains("lint-problems--visible")) {
            return;
        }
        this.root.classList.remove("lint-problems--visible");
        this.callbacks.onResize();
    }

    private setExpanded(expanded: boolean): void {
        this.expanded = expanded;
        this.root.classList.toggle("lint-problems--expanded", expanded);
        this.toggleButton.setAttribute("aria-expanded", String(expanded));
        this.body.hidden = !expanded;
        this.callbacks.onResize();
    }

    private setOverlaysVisible(visible: boolean): void {
        this.overlaysVisible = visible;
        this.overlaysButton.classList.toggle("lint-problems__overlays--off", !visible);
        this.overlaysButton.title = i18n.translate(
            visible ? "Hide lint overlays" : "Show lint overlays",
        );
        this.overlaysButton.setAttribute("aria-label", this.overlaysButton.title);
    }

    private renderBadges(): void {
        this.badges.replaceChildren();

        const counts = { error: 0, warn: 0, info: 0 };
        for (const issue of this.issues) {
            counts[issue.severity] += 1;
        }

        if (this.issues.length === 0) {
            this.badges.append(this.makeBadge("success", i18n.translate("No problems found.")));
            return;
        }
        if (counts.error > 0) {
            this.badges.append(this.makeBadge("error", i18n.translate("Errors"), counts.error));
        }
        if (counts.warn > 0) {
            this.badges.append(this.makeBadge("warning", i18n.translate("Warnings"), counts.warn));
        }
        if (counts.info > 0) {
            this.badges.append(this.makeBadge("info", i18n.translate("Information"), counts.info));
        }
    }

    private makeBadge(
        kind: "error" | "warning" | "info" | "success",
        title: string,
        count?: number,
    ): HTMLElement {
        const badge = makeElement("span", `lint-problems__badge lint-problems__badge--${kind}`);
        badge.title = title;
        badge.setAttribute("aria-label", count === undefined ? title : `${title}: ${count}`);
        const icon = makeElement("span", "lint-problems__icon");
        icon.innerHTML = kind === "warning" ? ICONS.warn : ICONS[kind];
        badge.append(icon);
        if (count !== undefined) {
            const label = document.createElement("span");
            label.textContent = String(count);
            badge.append(label);
        }
        return badge;
    }

    private renderList(): void {
        this.body.replaceChildren();

        if (this.issues.length === 0) {
            const empty = makeElement("div", "lint-problems__empty");
            const icon = makeElement("span", "lint-problems__icon");
            icon.innerHTML = ICONS.success;
            const text = document.createElement("span");
            text.textContent = i18n.translate("No problems found.");
            empty.append(icon, text);
            this.body.append(empty);
            return;
        }

        const list = makeElement("ul", "lint-problems__list");
        for (const issue of this.issues) {
            const item = document.createElement("li");
            item.append(this.makeRow(issue));
            list.append(item);
        }
        this.body.append(list);
    }

    private makeRow(issue: ProblemsPanelIssue): HTMLButtonElement {
        const row = makeElement("button", "lint-problems__row") as HTMLButtonElement;
        row.type = "button";
        const messageText = i18n.translate(issue.message);
        row.title = messageText;
        const severityLabel = i18n.translate(
            issue.severity === "error"
                ? "Errors"
                : issue.severity === "warn"
                  ? "Warnings"
                  : "Information",
        );
        row.setAttribute(
            "aria-label",
            [`${severityLabel}: ${messageText}`, issue.elementLabel, issue.rule]
                .filter(Boolean)
                .join(", "),
        );

        const icon = makeElement(
            "span",
            `lint-problems__icon lint-problems__icon--${issue.severity}`,
        );
        icon.innerHTML = ICONS[issue.severity];
        const message = makeElement("span", "lint-problems__row-message");
        message.textContent = messageText;
        row.append(icon, message);

        if (issue.elementLabel) {
            const label = makeElement("span", "lint-problems__row-element");
            label.textContent = issue.elementLabel;
            row.append(label);
        }
        const rule = makeElement("span", "lint-problems__row-rule");
        rule.textContent = issue.rule;
        row.append(rule);

        const { elementId } = issue;
        if (elementId) {
            row.addEventListener("click", () => this.callbacks.onSelectIssue(elementId));
        } else {
            row.disabled = true;
        }
        return row;
    }

    private renderLabels(): void {
        const title = i18n.translate("Problems");
        this.root.setAttribute("aria-label", title);
        this.title.textContent = title;
        this.setOverlaysVisible(this.overlaysVisible);
        this.renderBadges();
        this.renderList();
        if (this.root.classList.contains("lint-problems--visible")) {
            this.callbacks.onResize();
        }
    }
}
