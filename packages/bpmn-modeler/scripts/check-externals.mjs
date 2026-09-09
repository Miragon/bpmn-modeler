import { builtinModules } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILTINS = new Set(
    builtinModules.filter((name) => !name.startsWith("node:")).map((name) => name.split("/")[0]),
);

function listJavaScriptFiles(root) {
    const files = [];
    const walk = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (/\.(?:c|m)?js$/.test(entry.name)) files.push(path);
        }
    };
    walk(root);
    return files.sort();
}

function literalText(node) {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : undefined;
}

export function collectModuleSpecifiers(source, fileName = "output.js") {
    const sourceFile = ts.createSourceFile(
        fileName,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
    );
    const specifiers = [];

    const visit = (node) => {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier
        ) {
            const specifier = literalText(node.moduleSpecifier);
            if (specifier !== undefined) specifiers.push(specifier);
        } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
            const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
            const isRequire =
                node.arguments.length === 1 &&
                ts.isIdentifier(node.expression) &&
                node.expression.text === "require";
            if (isDynamicImport || isRequire) {
                const specifier = literalText(node.arguments[0]);
                if (specifier !== undefined) specifiers.push(specifier);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    return specifiers;
}

export function packageName(specifier) {
    if (
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        specifier.startsWith("#") ||
        /^[a-z][a-z+.-]*:/i.test(specifier)
    ) {
        return undefined;
    }
    if (specifier.startsWith("@")) {
        const [scope, name] = specifier.split("/");
        return name ? `${scope}/${name}` : specifier;
    }
    return specifier.split("/")[0];
}

export function checkExternals({
    distDir = resolve(PACKAGE_ROOT, "dist"),
    manifestPath = resolve(PACKAGE_ROOT, "package.json"),
} = {}) {
    if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
        throw new Error(`build output is missing: ${distDir}`);
    }

    const files = listJavaScriptFiles(distDir);
    if (files.length === 0) {
        throw new Error(`build output contains no JavaScript files: ${distDir}`);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const dependencies = manifest.dependencies ?? {};
    const offenders = [];

    for (const file of files) {
        const source = readFileSync(file, "utf8");
        for (const specifier of collectModuleSpecifiers(source, file)) {
            const dependency = packageName(specifier);
            if (!dependency || BUILTINS.has(dependency)) continue;
            if (!(dependency in dependencies)) {
                offenders.push(`${relative(distDir, file)}: ${specifier} (${dependency})`);
            }
        }
    }

    if (offenders.length > 0) {
        throw new Error(
            "emitted JavaScript imports undeclared runtime dependencies:\n" +
                offenders.map((item) => `  - ${item}`).join("\n"),
        );
    }

    return { checkedFiles: files.length };
}

function isMain() {
    return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
    try {
        const { checkedFiles } = checkExternals();
        console.log(`check-externals: checked ${checkedFiles} emitted JavaScript files.`);
    } catch (error) {
        console.error(`check-externals: ${error.message}`);
        process.exitCode = 1;
    }
}
