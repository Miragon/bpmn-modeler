import { staticUnresolvedModdleExtensions } from "@miragon/bpmn-modeler-types";
import { createBundledResolver, type Resolver } from "@miragon/bpmnlint-plugin-rules";

// Re-exported so `browserLinter.ts` and `browserResolver.spec.ts` keep importing
// it from here; the implementation moved to modeler-types so the host's
// escalation pre-check shares the exact same logic.
export { staticUnresolvedModdleExtensions };

/**
 * A bpmnlint rule that reports nothing. Substituted for a rule/config the bundled
 * resolver cannot provide so a single unknown `bpmnlint-plugin-*` reference never
 * fails the whole run (bpmnlint's `Linter` rejects the entire lint if
 * `resolveRule`/`resolveConfig` throws). `check` is an empty visitor — a bare
 * `{}` trips testRule's "no check implemented" guard and surfaces a spurious
 * rule-error marker.
 */
const NOOP_RULE = () => ({ check: () => undefined });

/** An empty shareable config — the `resolveConfig` fallback for a missing plugin config. */
const NOOP_CONFIG = { rules: {} };

/**
 * Wraps `@miragon/bpmnlint-plugin-rules`' bundled resolver (bpmnlint built-ins +
 * camunda-compat engine layers + the Miragon rules) and *records* every rule or
 * config the bundle cannot cover instead of throwing. This is the browser twin of
 * modeler-core's `CompositeResolver`: an unresolved reference is collected in
 * {@link unresolved} and backed by a no-op, so an explicit `{config}` that names
 * a rule only a workspace install would provide degrades gracefully rather than
 * killing the lint.
 *
 * The instance is reused across lint runs; {@link reset} clears the list at the
 * start of each run so `unresolved` always reflects the latest lint alone.
 */
export class RecordingBrowserResolver implements Resolver {
    /** Names of rules/configs the bundle could not resolve this run. */
    readonly unresolved: string[] = [];

    private readonly bundled: Resolver = createBundledResolver();

    resolveRule(pkg: string, ruleName: string): unknown {
        const resolved = this.tryResolve(() => this.bundled.resolveRule(pkg, ruleName));
        if (resolved != null) {
            return resolved;
        }
        this.unresolved.push(`${pkg}/${ruleName}`);
        return NOOP_RULE;
    }

    resolveConfig(pkg: string, configName: string): unknown {
        const resolved = this.tryResolve(() => this.bundled.resolveConfig(pkg, configName));
        if (resolved != null) {
            return resolved;
        }
        this.unresolved.push(`plugin:${pkg}/${configName}`);
        return NOOP_CONFIG;
    }

    reset(): void {
        this.unresolved.length = 0;
    }

    /**
     * The bundled resolver throws on a miss, so a throw is a normal miss (not an
     * error to propagate); only a nullish result also counts as a miss.
     */
    private tryResolve(resolve: () => unknown): unknown {
        try {
            const resolved = resolve();
            return resolved != null ? resolved : undefined;
        } catch {
            return undefined;
        }
    }
}
