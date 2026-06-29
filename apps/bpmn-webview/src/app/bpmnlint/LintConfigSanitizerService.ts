import { KNOWN_EXTENDS, KNOWN_RULES } from "./LintingRuleResolver";

/**
 * The runtime-packed config the linter consumes: an `extends` chain of built-in
 * config names plus inline rule overrides. This is the `config` half of the
 * `{ config, resolver }` pair `linting.setLinterConfig` expects.
 */
export interface BpmnlintRuntimeConfig {
    extends: string[];
    rules: Record<string, unknown>;
}

export interface SanitizedBpmnlintConfig {
    config: BpmnlintRuntimeConfig;
    warnings: string[];
}

/**
 * DI service that filters a raw `.bpmnlintrc` down to what the current scope
 * supports — built-in rules only — returning a warning per dropped entry instead
 * of letting the resolver throw `unknown rule <…>` at lint time.
 *
 * Owns the allow-lists (derived from the static resolver cache, the single source
 * of truth) so callers just hand it the raw config. Built-in rules are bare names
 * (`label-required`); `extends` entries use the `bpmnlint:<name>` form. Anything
 * else (custom `plugin:*`, `pkg/rule` keys, `extends` to external npm configs) is
 * dropped with a warning.
 */
export class LintConfigSanitizerService {
    sanitize(raw: Record<string, unknown>): SanitizedBpmnlintConfig {
        const warnings: string[] = [];

        const rawExtends = Array.isArray(raw.extends)
            ? raw.extends
            : raw.extends != null
              ? [raw.extends]
              : [];

        const extendsArr: string[] = [];
        for (const entry of rawExtends) {
            const name = String(entry);
            if (KNOWN_EXTENDS.has(name)) {
                extendsArr.push(name);
            } else {
                warnings.push(
                    `Unsupported bpmnlint config "${name}" skipped (current scope supports built-in rules only)`,
                );
            }
        }

        const rules: Record<string, unknown> = {};
        const rawRules = (raw.rules ?? {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(rawRules)) {
            if (KNOWN_RULES.has(key)) {
                rules[key] = value;
            } else {
                warnings.push(
                    `Unsupported bpmnlint rule "${key}" skipped (custom/3rd-party rules are out of the current scope)`,
                );
            }
        }

        return { config: { extends: extendsArr, rules }, warnings };
    }
}
