import selectorParser from "postcss-selector-parser";

// Legacy split stylesheets must work without a data-dmn-theme attribute.
const ATTRIBUTE = "data-dmn-theme";

function isCombinator(node) {
    return node?.type === "combinator";
}

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
            // Preserve the descendant relationship when removing a standalone scope.
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
