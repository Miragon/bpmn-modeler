/**
 * The resolver contract bpmnlint's `Linter` consumes. Declared here (rather than
 * imported from the untyped `bpmnlint` package) so the whole bpmnlint seam needs
 * no ambient module declaration.
 */
export interface Resolver {
    resolveRule(pkg: string, ruleName: string): unknown;
    resolveConfig(pkg: string, configName: string): unknown;
}

/**
 * A bpmnlint rule that reports nothing. Substituted for a rule/config that could
 * not be resolved so a single missing `bpmnlint-plugin-*` never fails the whole
 * lint (bpmnlint's `Linter` rejects the entire run if `resolveRule`/`resolveConfig`
 * throws). `check` is an empty visitor — a bare `{}` would trip testRule's
 * "no check implemented" guard and surface a spurious rule-error marker.
 */
const NOOP_RULE = () => ({ check: () => undefined });

/** An empty shareable config — the resolveConfig fallback for a missing plugin config. */
const NOOP_CONFIG = { rules: {} };

/**
 * Resolves bpmnlint rules and configs by trying each delegate in order — the
 * workspace first (custom `bpmnlint-plugin-*` packages, and the workspace's own
 * `bpmnlint` if installed), then `@miragon/bpmnlint-plugin-rules`' bundled resolver
 * (bpmnlint built-ins + camunda-compat engine layers + the Miragon rules). The
 * workspace delegate is tried first, so a project's own installed copy always
 * wins; the bundled resolver only backs what the workspace cannot provide.
 *
 * A rule/config that no delegate can resolve is *skipped*, not thrown: its name
 * is collected in {@link unresolved} and a no-op is returned so the rest of the
 * lint still runs. An unknown rule becomes a visible, non-fatal "N rules skipped"
 * rather than failing the whole lint or being silently dropped.
 */
export class CompositeResolver implements Resolver {
    /** Names of rules/configs that could not be resolved this run. */
    readonly unresolved: string[] = [];

    private readonly resolvers: Resolver[];

    constructor(...resolvers: Resolver[]) {
        this.resolvers = resolvers;
    }

    resolveRule(pkg: string, ruleName: string): unknown {
        const resolved = this.tryResolve((r) => r.resolveRule(pkg, ruleName));
        if (resolved !== undefined) {
            return resolved;
        }
        this.unresolved.push(`${pkg}/${ruleName}`);
        return NOOP_RULE;
    }

    resolveConfig(pkg: string, configName: string): unknown {
        const resolved = this.tryResolve((r) => r.resolveConfig(pkg, configName));
        if (resolved !== undefined) {
            return resolved;
        }
        this.unresolved.push(`plugin:${pkg}/${configName}`);
        return NOOP_CONFIG;
    }

    /**
     * Tries each delegate in registration order. Each resolver throws (or returns
     * null/undefined) on a miss, so a throw is a normal miss, not an error to
     * propagate. A resolved rule/config is always an object, so only nullish
     * counts as a miss — a hypothetical falsy-but-valid result still passes.
     */
    private tryResolve(resolve: (r: Resolver) => unknown): unknown {
        for (const resolver of this.resolvers) {
            try {
                const resolved = resolve(resolver);
                if (resolved != null) {
                    return resolved;
                }
            } catch {
                // miss — fall through to the next resolver
            }
        }
        return undefined;
    }
}
