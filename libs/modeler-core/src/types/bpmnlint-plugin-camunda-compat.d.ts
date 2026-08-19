/**
 * `bpmnlint-plugin-camunda-compat` ships no type declarations. The bundled default
 * lint config imports its `configs` (per-platform rule sets) plus every rule module
 * by path — see the generated `bundledDefaultResolver.ts`. Both are opaque: they
 * pass straight through to bpmnlint's `StaticResolver`/`Linter`, so `unknown` is the
 * honest type.
 *
 * Ambient shim (no top-level `import`/`export`) so `declare module` types the
 * existing untyped JS module; each consuming tsconfig picks it up via `include`.
 */
declare module "bpmnlint-plugin-camunda-compat" {
    const plugin: {
        configs: Record<string, unknown>;
        rules: Record<string, unknown>;
    };
    export default plugin;
}

declare module "bpmnlint-plugin-camunda-compat/rules/*" {
    const rule: unknown;
    export default rule;
}
