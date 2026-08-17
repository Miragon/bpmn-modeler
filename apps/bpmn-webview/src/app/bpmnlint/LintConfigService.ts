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

/** Minimal facades of the bpmn-js services this feature touches. */
interface Canvas {
    getContainer(): HTMLElement;
    resized(): void;
    scrollToElement(element: object): void;
}

interface ElementRegistry {
    get(id: string): { businessObject?: { name?: string } } | undefined;
}

interface Selection {
    select(element: object): void;
}

const SEVERITY_RANK: Record<ProblemsPanelIssue["severity"], number> = {
    error: 0,
    warn: 1,
    info: 2,
};

/**
 * URL query parameter mirroring the eye-toggle's overlay-visibility choice, so a
 * reload keeps it. `?overlays=off` hides overlays; its absence means visible.
 *
 * Practically this matters in the standalone browser preview (a real, shareable,
 * reloadable URL); in a hosted webview the URL isn't user-facing, so it is a
 * harmless no-op — never set on load, and `replaceState` only rewrites the
 * invisible internal URL.
 */
const OVERLAYS_PARAM = "overlays";

function readOverlaysPreference(): boolean {
    try {
        return new URLSearchParams(window.location.search).get(OVERLAYS_PARAM) !== "off";
    } catch {
        return true;
    }
}

function writeOverlaysPreference(visible: boolean): void {
    try {
        const url = new URL(window.location.href);
        if (visible) {
            url.searchParams.delete(OVERLAYS_PARAM);
        } else {
            url.searchParams.set(OVERLAYS_PARAM, "off");
        }
        window.history.replaceState(null, "", url);
    } catch {
        // Some hosts sandbox history/URL mutation; the in-memory toggle still
        // works, just without reload persistence.
    }
}

/**
 * bpmnlint's categories, folded onto the three severities the panel renders.
 * `rule-error` is what bpmnlint reports when a rule itself crashed — surfaced
 * as an error so a broken custom rule doesn't fail silently.
 */
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

/**
 * bpmn-js DI service (registered by {@link LintModule}) that renders
 * host-computed bpmnlint results in the canvas. The extension host now runs the
 * linter (a full Node context, so it resolves custom `bpmnlint-plugin-*` rules
 * against the workspace); the webview only paints overlays and the problems
 * panel.
 *
 * It feeds results into `bpmn-js-bpmnlint`'s `linting` module by overriding the
 * module's `lint()` to return whatever the host last sent, instead of running a
 * browser-side `Linter`. The module's own `update()` — fired on import, element
 * changes, and toggles — then diffs and draws the overlays exactly as before, so
 * no overlay/rendering code changes.
 *
 * The module's own status button is hidden entirely (see bpmnlint.css); the
 * docked {@link ProblemsPanel} replaces it. Overlay visibility is tracked here
 * as an explicit user preference — seeded from the URL and persisted back to it
 * (see {@link OVERLAYS_PARAM}) — so the host's re-lint on every document change
 * cannot silently re-activate overlays the user just hid, and a reload keeps the
 * choice.
 */
export class LintConfigService {
    static $inject = ["linting", "canvas", "elementRegistry", "selection"];

    private results: LintResults = {};

    private overlaysVisible = readOverlaysPreference();

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

    /**
     * Lazily mounts the problems panel by re-parenting the canvas host into a
     * column so the panel docks below the diagram while the properties panel
     * keeps its full height. Done here, not in the host shells, so every host
     * (VS Code, IntelliJ, standalone) gets the panel from the shared bundle.
     */
    private ensurePanel(): ProblemsPanel {
        if (this.panel) {
            return this.panel;
        }

        const column = document.createElement("div");
        column.className = "lint-problems-column";
        // getContainer() returns the inner .djs-container, which bpmn-js nests
        // inside its own .bjs-container wrapper — climb to the host shell's
        // `.canvas` div (#js-canvas) so bpmn-js's own subtree stays untouched
        // and the column takes the canvas's slot in the .content flex row.
        const canvasHost = this.canvas.getContainer().closest(".canvas");
        const contentRow = canvasHost?.parentElement;
        if (canvasHost && contentRow) {
            contentRow.insertBefore(column, canvasHost);
            column.append(canvasHost);
        } else {
            // Headless/test DOM without the .content layout: still render the
            // panel somewhere queryable instead of failing.
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
        if (!element) {
            return;
        }
        this.selection.select(element);
        this.canvas.scrollToElement(element);
    }

    private setOverlaysVisible(visible: boolean): void {
        this.overlaysVisible = visible;
        writeOverlaysPreference(visible);
        if (this.linting.isActive() !== visible) {
            this.linting.toggle(visible);
        }
    }

    /** Flattens the rule-keyed result map into severity-sorted panel rows. */
    private flatten(results: LintResults): ProblemsPanelIssue[] {
        const issues = Object.entries(results).flatMap(([rule, reports]) =>
            reports.map((report) => ({
                elementId: report.id,
                elementLabel: report.id ? this.labelFor(report.id) : undefined,
                message: report.message,
                severity: toSeverity(report.category),
                rule: report.rule ?? rule,
            })),
        );
        return issues.sort(
            (a, b) =>
                SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
                a.rule.localeCompare(b.rule) ||
                a.message.localeCompare(b.message),
        );
    }

    private labelFor(elementId: string): string {
        const name = this.elementRegistry.get(elementId)?.businessObject?.name;
        return name || elementId;
    }
}
