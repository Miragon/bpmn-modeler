import selectorParser from "postcss-selector-parser";

/**
 * PostCSS plugin that strips the `[data-bpmn-theme="dark"]` scope from every
 * selector, turning the single scoped source (`dark-theme/*.css`) back into the
 * legacy un-scoped `darkTheme.css` shape linked via `#theme-link`.
 *
 * Two cases, matching the authored scoping conventions:
 *   - the attribute stands alone in its compound (`[data-bpmn-theme="dark"] S`)
 *     → replace it with `:root`, preserving the descendant relationship;
 *   - the attribute is compounded onto another simple selector
 *     (`:root[data-bpmn-theme="dark"]`, `.am-overlay-root[data-bpmn-theme="dark"]`)
 *     → delete just the attribute node, leaving the rest of the compound.
 *
 * A no-op on selectors that never mention the attribute (e.g. the light input).
 */
const ATTRIBUTE = "data-bpmn-theme";

function isCombinator(node) {
    return node?.type === "combinator";
}

/** The non-combinator nodes sharing `attr`'s compound (contiguous, no combinator). */
function compoundSize(attr) {
    const siblings = attr.parent.nodes;
    const index = siblings.indexOf(attr);
    let count = 1;
    for (let i = index - 1; i >= 0 && !isCombinator(siblings[i]); i--) count++;
    for (let i = index + 1; i < siblings.length && !isCombinator(siblings[i]); i++) count++;
    return count;
}

const transform = selectorParser((selectors) => {
    selectors.walkAttributes((attr) => {
        if (attr.attribute !== ATTRIBUTE) return;
        if (compoundSize(attr) === 1) {
            attr.replaceWith(selectorParser.pseudo({ value: ":root" }));
        } else {
            attr.remove();
        }
    });
});

export default function stripThemeScope() {
    return {
        postcssPlugin: "strip-theme-scope",
        Rule(rule) {
            if (!rule.selector.includes(ATTRIBUTE)) return;
            rule.selector = transform.processSync(rule.selector);
        },
    };
}

stripThemeScope.postcss = true;
