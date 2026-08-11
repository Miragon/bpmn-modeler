/**
 * Example bpmnlint plugin.
 *
 * A bpmnlint plugin package is named `bpmnlint-plugin-<name>` and exports its
 * `rules` (as *path references*, which bpmnlint requires relative to this file)
 * and, optionally, shareable `configs`. Referenced from a `.bpmnlintrc` as
 * `plugin:<name>/<config>` (extends) or `<name>/<rule>` (a single rule) — here
 * the `<name>` is `custom-rules`.
 */
module.exports = {
    configs: {
        // Turn every rule on with `"extends": ["plugin:custom-rules/recommended"]`.
        recommended: {
            rules: {
                "no-todo-in-name": "error",
            },
        },
    },
    rules: {
        // Value is a path reference (not the rule function) — the bpmnlint
        // plugin contract; bpmnlint `require`s it relative to this package.
        "no-todo-in-name": "./rules/no-todo-in-name",
    },
};
