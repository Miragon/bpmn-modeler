import { LintResults } from "@miragon/bpmn-modeler-shared";

/**
 * bpmn-js DI service (registered by {@link LintModule}) that renders
 * host-computed bpmnlint results in the canvas. The extension host now runs the
 * linter (a full Node context, so it resolves custom `bpmnlint-plugin-*` rules
 * against the workspace); the webview only paints overlays.
 *
 * It feeds results into `bpmn-js-bpmnlint`'s `linting` module by overriding the
 * module's `lint()` to return whatever the host last sent, instead of running a
 * browser-side `Linter`. The module's own `update()` — fired on import, element
 * changes, and toggles — then diffs and draws the overlays exactly as before, so
 * no overlay/rendering code changes.
 */
export class LintConfigService {
    static $inject = ["linting"];

    private results: LintResults = {};

    constructor(private readonly linting: any) {
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
            return;
        }

        this.results = results;
        document.body.classList.add("bpmnlint-active");
        if (this.linting.isActive()) {
            this.linting.update();
        } else {
            // Activating fires `linting.toggle`, which triggers the first `update()`.
            this.linting.toggle(true);
        }
    }
}
