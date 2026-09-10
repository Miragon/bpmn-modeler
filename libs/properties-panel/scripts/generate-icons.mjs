/**
 * Regenerates `src/render/icons/index.tsx` from the pinned
 * `bpmn-js-properties-panel` dist sourcemap — offline, no deps.
 *
 * The upstream header icons ship only as svgr-compiled modules inside
 * `dist/index.esm.js.map`'s `sourcesContent` (see ADR 0017 + #1456). This script
 * evaluates each `src/icons/*.svg` module body with a recording
 * `React.createElement` stub, serialises the captured tree to preact TSX, and
 * reproduces the `iconsByType` map from `src/icons/index.js` verbatim.
 *
 * On the next upstream bump: re-run `node scripts/generate-icons.mjs` and diff.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_VERSION = "5.65.0";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const sourcemapPath = resolve(
    repoRoot,
    "node_modules/bpmn-js-properties-panel/dist/index.esm.js.map",
);
const outPath = resolve(here, "../src/render/icons/index.tsx");

// Sentinel spread marker: survives the module's Object.assign(defaults, props),
// so serialisation can re-emit `{...props}` at its captured position (last).
const PROPS_SPREAD = "__PROPS_SPREAD__";

const map = JSON.parse(readFileSync(sourcemapPath, "utf8"));
const contentBySource = new Map();
map.sources.forEach((source, index) => {
    contentBySource.set(source, map.sourcesContent[index]);
});

function findSource(suffix) {
    for (const source of map.sources) {
        if (source.endsWith(suffix)) {
            return source;
        }
    }
    throw new Error(`source not found: ${suffix}`);
}

// Evaluate one svgr module body into a recorded element tree.
function evaluateIconModule(code) {
    const body = code
        .replace(/^import React from "react";\s*$/m, "")
        .replace(/export default\s+/, "return ");

    const createElement = (tag, props, ...children) => ({
        tag,
        props: props ?? {},
        children: children.flat(Infinity).filter((child) => child != null),
    });

    const factory = new Function("React", body);
    const component = factory({ createElement });

    return component({ [PROPS_SPREAD]: true });
}

function serializeNode(node, depth) {
    const pad = "    ".repeat(depth);
    const attrs = [];
    for (const [key, value] of Object.entries(node.props)) {
        if (key === PROPS_SPREAD) {
            attrs.push("{...props}");
            continue;
        }
        if (String(value).includes('"')) {
            throw new Error(`attribute value contains a double quote: ${key}`);
        }
        attrs.push(`${key}="${value}"`);
    }
    const openTag = `<${node.tag} ${attrs.join(" ")}`;

    if (node.children.length === 0) {
        return `${pad}${openTag} />`;
    }

    const children = node.children.map((child) => serializeNode(child, depth + 1)).join("\n");
    return `${pad}${openTag}>\n${children}\n${pad}</${node.tag}>`;
}

// Parse `src/icons/index.js`: import name → svg file, plus the type→name map.
const indexSource = contentBySource.get(findSource("icons/index.js"));

const imports = [];
for (const match of indexSource.matchAll(/import (\w+) from '\.\/([^']+)';/g)) {
    imports.push({ name: match[1], file: match[2] });
}

const mapBody = indexSource.match(/export default \{([\s\S]*?)\};/)[1];
const entries = [];
for (const match of mapBody.matchAll(/'([^']+)':\s*(\w+),?/g)) {
    entries.push({ type: match[1], name: match[2] });
}

// Emit one component per import, preserving upstream declaration order.
const components = imports.map(({ name, file }) => {
    const moduleCode = contentBySource.get(findSource(`icons/${file}`));
    const tree = evaluateIconModule(moduleCode);
    const jsx = serializeNode(tree, 1);
    return `const ${name} = ({ styles: _styles, ...props }: IconProps): JSX.Element => (\n${jsx}\n);`;
});

const mapLines = entries.map(({ type, name }) => `    "${type}": ${name},`);

const output = `/** @jsxImportSource @bpmn-io/properties-panel/preact */
/**
 * Forked from bpmn-js-properties-panel v${UPSTREAM_VERSION} (MIT). See LICENSE-upstream.
 *
 * GENERATED FILE — do not hand-edit. Regenerate with
 * \`node scripts/generate-icons.mjs\` after an upstream bump, then diff.
 *
 * The upstream per-type header icons ship only in the dist this lib must not
 * import, so they are vendored here as preact components. Template-driven icons
 * and documentation refs remain dropped (they need the \`elementTemplates\`
 * service, absent from a neutral modeler).
 */
import type { JSX } from "@bpmn-io/properties-panel/preact";

type IconProps = JSX.SVGAttributes<SVGSVGElement> & { styles?: unknown };

${components.join("\n\n")}

const iconsByType: Record<string, (props: IconProps) => JSX.Element> = {
${mapLines.join("\n")}
};

export default iconsByType;
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, output);

console.log(
    `Generated ${outPath} (${components.length} components, ${entries.length} type mappings).`,
);
