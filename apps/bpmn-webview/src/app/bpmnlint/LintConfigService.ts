import { LintResults } from "@miragon/bpmn-modeler-shared";

import { ProblemsPanel, ProblemsPanelIssue } from "./ProblemsPanel";

/**
 * The subset of `bpmn-js-bpmnlint`'s `linting` module this service drives. The
 * package ships no types, so we declare only the members we touch: `lint` is
 * overridden to return host-computed results, and `update`/`isActive`/`toggle`
 * repaint or clear the overlays.
 */
interface Linting {
    lint: () => Promise<LintResults>;
    update(): void;
    isActive(): boolean;
    toggle(active: boolean): void;
}

interface Canvas {
    getContainer(): HTMLElement;
    resized(): void;
    scrollToElement(element: object): void;
    viewbox(): Viewbox;
    viewbox(viewbox: Viewbox): void;
}

interface DiagramElement {
    businessObject?: { name?: string };
    parent?: object;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    waypoints?: ReadonlyArray<{ x: number; y: number }>;
}

interface ElementRegistry {
    get(id: string): DiagramElement | undefined;
}

interface Selection {
    select(element: object): void;
}

interface Viewbox {
    x: number;
    y: number;
    width: number;
    height: number;
}

const SEVERITY_RANK: Record<ProblemsPanelIssue["severity"], number> = {
    error: 0,
    warn: 1,
    info: 2,
};

function toSeverity(category: string): ProblemsPanelIssue["severity"] {
    switch (category) {
        case "error":
        case "rule-error":
            return "error";
        case "warn":
        case "warning":
            return "warn";
        default:
            return "info";
    }
}

function centerOf(element: DiagramElement): { x: number; y: number } | undefined {
    if (typeof element.x === "number" && typeof element.y === "number") {
        return {
            x: element.x + (element.width ?? 0) / 2,
            y: element.y + (element.height ?? 0) / 2,
        };
    }
    const waypoints = element.waypoints;
    if (!waypoints?.length) {
        return undefined;
    }
    const x = waypoints.map((point) => point.x);
    const y = waypoints.map((point) => point.y);
    return {
        x: (Math.min(...x) + Math.max(...x)) / 2,
        y: (Math.min(...y) + Math.max(...y)) / 2,
    };
}

/**
 * bpmn-js DI service (registered by {@link LintModule}) that renders
 * host-computed bpmnlint results as canvas overlays and in the problems panel.
 *
 * It feeds results into `bpmn-js-bpmnlint`'s `linting` module by overriding the
 * module's `lint()` to return whatever the host last sent, instead of running a
 * browser-side `Linter`. The module's own `update()` — fired on import, element
 * changes, and toggles — then diffs and draws the overlays exactly as before, so
 * no overlay/rendering code changes.
 */
export class LintConfigService {
    static $inject = ["linting", "canvas", "elementRegistry", "selection"];

    private results: LintResults = {};

    private overlaysVisible = true;

    private panel: ProblemsPanel | null = null;

    constructor(
        private readonly linting: Linting,
        private readonly canvas: Canvas,
        private readonly elementRegistry: ElementRegistry,
        private readonly selection: Selection,
    ) {
        // Replace the browser-side lint run with the host's precomputed results.
        // `update()` calls `this.lint()`; returning the stored results makes every
        // relint (import.done / elements.changed) repaint them until the host,
        // which re-lints on document change, sends a fresh set.
        this.linting.lint = () => Promise.resolve(this.results);
    }

    /**
     * Renders `results`, or deactivates linting when `results` is `null` (no
     * `.bpmnlintrc`, or a host read/lint failure) — keeping the no-config
     * experience identical to before linting moved to the host.
     */
    render(results: LintResults | null): void {
        if (!results) {
            this.results = {};
            if (this.linting.isActive()) {
                // Fires `linting.toggle`, which clears the overlays via `update()`.
                this.linting.toggle(false);
            }
            document.body.classList.remove("bpmnlint-active");
            this.panel?.hide();
            return;
        }

        this.results = results;
        document.body.classList.add("bpmnlint-active");
        if (this.overlaysVisible) {
            if (this.linting.isActive()) {
                this.linting.update();
            } else {
                // Activating fires `linting.toggle`, which triggers the first `update()`.
                this.linting.toggle(true);
            }
        }
        this.ensurePanel().update(this.flatten(results));
    }

    /** Mounts the panel below the canvas without changing any host HTML shell. */
    private ensurePanel(): ProblemsPanel {
        if (this.panel) {
            return this.panel;
        }

        const column = document.createElement("div");
        column.className = "lint-problems-column";
        const canvasHost = this.canvas.getContainer().closest(".canvas");
        const content = canvasHost?.parentElement;
        if (canvasHost && content) {
            content.insertBefore(column, canvasHost);
            column.append(canvasHost);
        } else {
            document.body.append(column);
        }

        this.panel = new ProblemsPanel(
            column,
            {
                onSelectIssue: (elementId) => this.revealElement(elementId),
                onToggleOverlays: (visible) => this.setOverlaysVisible(visible),
                onResize: () => this.canvas.resized(),
            },
            this.overlaysVisible,
        );
        this.canvas.resized();
        return this.panel;
    }

    private revealElement(elementId: string): void {
        const element = this.elementRegistry.get(elementId);
        const center = element?.parent && centerOf(element);
        if (!element || !center) {
            return;
        }

        // scrollToElement switches to the element's root plane before selection.
        this.canvas.scrollToElement(element);
        const viewbox = this.canvas.viewbox();
        this.canvas.viewbox({
            x: center.x - viewbox.width / 2,
            y: center.y - viewbox.height / 2,
            width: viewbox.width,
            height: viewbox.height,
        });
        this.selection.select(element);
    }

    private setOverlaysVisible(visible: boolean): void {
        this.overlaysVisible = visible;
        if (this.linting.isActive() !== visible) {
            this.linting.toggle(visible);
        }
    }

    private flatten(results: LintResults): ProblemsPanelIssue[] {
        const issues = Object.entries(results).flatMap(([rule, reports]) =>
            reports.map((report) => {
                const element = report.id ? this.elementRegistry.get(report.id) : undefined;
                const elementId = element?.parent && centerOf(element) ? report.id : undefined;
                return {
                    elementId,
                    elementLabel: report.id ? this.labelFor(report.id) : undefined,
                    message: report.message,
                    severity: toSeverity(report.category),
                    rule: report.rule ?? rule,
                };
            }),
        );
        return issues.sort(
            (a, b) =>
                SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
                (a.elementLabel ?? "").localeCompare(b.elementLabel ?? "") ||
                a.rule.localeCompare(b.rule) ||
                a.message.localeCompare(b.message),
        );
    }

    private labelFor(elementId: string): string {
        return this.elementRegistry.get(elementId)?.businessObject?.name || elementId;
    }
}
