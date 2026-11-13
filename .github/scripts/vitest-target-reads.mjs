// The files a spec reads instead of importing, resolved statically, and which
// of them a Vitest target's trigger paths miss. Pure: callers pass the source
// text and the repository's file list.
import { posix } from "node:path";
import ts from "typescript";

// Paths are evaluated under a virtual root so a resolved path never depends on
// where the repository is checked out or on the working directory.
const VIRTUAL_ROOT = "/__repo__";
const VIRTUAL_ROOT_URL = `file://${VIRTUAL_ROOT}`;
const PATH_MODULES = new Set(["path", "node:path"]);
const URL_MODULES = new Set(["url", "node:url"]);
const PATH_FUNCTIONS = new Set(["join", "resolve", "normalize", "dirname"]);
const QUERY_OR_HASH = /[?#].*$/;

export function withoutQuery(specifier) {
    return specifier.replace(QUERY_OR_HASH, "");
}

export function readPathCandidates(sourceText, filePath) {
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const evaluator = createEvaluator(sourceFile, `${VIRTUAL_ROOT}/${filePath}`);
    const anchoredPaths = [];
    const strings = [];
    let bindsRepoRoot = false;
    const visit = (node) => {
        if (isModuleSpecifier(node)) return;
        if (isEvaluationRoot(node)) {
            const value = evaluator.evaluate(node);
            const path = value === undefined ? undefined : virtualPathOf(value);
            if (path !== undefined) {
                if (path === "") bindsRepoRoot = true;
                else anchoredPaths.push(path);
            } else if (value !== undefined) {
                strings.push(value);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    const rootRelativeNames = bindsRepoRoot ? strings.flatMap(repoRelativeName) : [];
    return [...new Set([...anchoredPaths, ...rootRelativeNames])]
        .filter((path) => !path.startsWith("..") && path !== "")
        .sort();
}

export function uncoveredReads(candidates, { targetDir, repoFiles, isTriggered }) {
    const repoFileSet = new Set(repoFiles);
    return candidates.flatMap((path) => {
        if (path === targetDir || path.startsWith(`${targetDir}/`)) return [];
        if (repoFileSet.has(path)) return isTriggered(path) ? [] : [{ path, kind: "file" }];
        const filesUnder = repoFiles.filter((file) => file.startsWith(`${path}/`));
        if (filesUnder.length === 0) return [];
        return filesUnder.some(isTriggered) ? [] : [{ path, kind: "directory" }];
    });
}

function isEvaluationRoot(node) {
    return (
        ts.isCallExpression(node) ||
        ts.isNewExpression(node) ||
        ts.isTemplateExpression(node) ||
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    );
}

function isModuleSpecifier(node) {
    const parent = node.parent;
    if (!parent) return false;
    return (
        ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
            parent.moduleSpecifier === node) ||
        (ts.isExternalModuleReference(parent) && parent.expression === node) ||
        (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent))
    );
}

/** The repo-relative path of a virtual path or file URL, or undefined for any other string. */
function virtualPathOf(value) {
    const path = value.startsWith(VIRTUAL_ROOT_URL)
        ? decodeURIComponent(new URL(value).pathname)
        : value;
    if (path !== VIRTUAL_ROOT && !path.startsWith(`${VIRTUAL_ROOT}/`)) return undefined;
    return withoutQuery(posix.relative(VIRTUAL_ROOT, posix.normalize(path)));
}

function repoRelativeName(value) {
    const name = posix.normalize(withoutQuery(value)).replace(/\/$/, "");
    if (name === "." || name.startsWith("/") || name.startsWith("..")) return [];
    return [name];
}

function createEvaluator(sourceFile, virtualFilePath) {
    const pathBindings = new Map();
    const urlBindings = new Map();
    const constInitializers = new Map();
    collectBindings(sourceFile, { pathBindings, urlBindings, constInitializers });
    const evaluating = new Set();

    const evaluateIdentifier = (name) => {
        if (name === "__dirname") return posix.dirname(virtualFilePath);
        if (name === "__filename") return virtualFilePath;
        const initializer = constInitializers.get(name);
        if (!initializer || evaluating.has(name)) return undefined;
        evaluating.add(name);
        try {
            return evaluate(initializer);
        } finally {
            evaluating.delete(name);
        }
    };

    const evaluateImportMeta = (property) => {
        if (property === "dirname") return posix.dirname(virtualFilePath);
        if (property === "filename") return virtualFilePath;
        if (property === "url") return `file://${virtualFilePath}`;
        return undefined;
    };

    const pathFunctionOf = (callee) => {
        if (ts.isIdentifier(callee)) return pathBindings.get(callee.text);
        if (!ts.isPropertyAccessExpression(callee) || !PATH_FUNCTIONS.has(callee.name.text)) {
            return undefined;
        }
        const owner = callee.expression;
        const ownerIsPathModule =
            (ts.isIdentifier(owner) && pathBindings.get(owner.text) === "module") ||
            (ts.isPropertyAccessExpression(owner) &&
                owner.name.text === "posix" &&
                ts.isIdentifier(owner.expression) &&
                pathBindings.get(owner.expression.text) === "module") ||
            (ts.isIdentifier(owner) && pathBindings.get(owner.text) === "posix");
        return ownerIsPathModule ? callee.name.text : undefined;
    };

    const evaluateCall = (node) => {
        const callee = node.expression;
        const args = node.arguments.map(evaluate);
        if (args.some((arg) => arg === undefined)) return undefined;
        if (ts.isIdentifier(callee) && urlBindings.get(callee.text) === "fileURLToPath") {
            return args[0]?.startsWith("file://")
                ? decodeURIComponent(new URL(args[0]).pathname)
                : undefined;
        }
        const pathFunction = pathFunctionOf(callee);
        if (pathFunction === "join" || pathFunction === "normalize") {
            return args.length > 0 ? posix[pathFunction](...args) : undefined;
        }
        if (pathFunction === "dirname")
            return args.length === 1 ? posix.dirname(args[0]) : undefined;
        if (pathFunction === "resolve") {
            return args.some((arg) => arg.startsWith("/")) ? posix.resolve(...args) : undefined;
        }
        return undefined;
    };

    const evaluateNewUrl = (node) => {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "URL") return undefined;
        const args = (node.arguments ?? []).map(evaluate);
        if (args.length !== 2 || args.some((arg) => arg === undefined)) return undefined;
        if (!args[1].startsWith("file://")) return undefined;
        return new URL(args[0], args[1]).href;
    };

    function evaluate(node) {
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
            return evaluate(node.expression);
        }
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
        if (ts.isIdentifier(node)) return evaluateIdentifier(node.text);
        if (ts.isTemplateExpression(node)) {
            let text = node.head.text;
            for (const span of node.templateSpans) {
                const value = evaluate(span.expression);
                if (value === undefined) return undefined;
                text += value + span.literal.text;
            }
            return text;
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            const left = evaluate(node.left);
            const right = evaluate(node.right);
            return left === undefined || right === undefined ? undefined : left + right;
        }
        if (ts.isPropertyAccessExpression(node)) {
            if (ts.isMetaProperty(node.expression)) return evaluateImportMeta(node.name.text);
            if (node.name.text === "pathname") {
                const url = evaluate(node.expression);
                return url?.startsWith("file://")
                    ? decodeURIComponent(new URL(url).pathname)
                    : undefined;
            }
            if (node.name.text === "href") {
                const url = evaluate(node.expression);
                return url?.startsWith("file://") ? url : undefined;
            }
            return undefined;
        }
        if (ts.isCallExpression(node)) return evaluateCall(node);
        if (ts.isNewExpression(node)) return evaluateNewUrl(node);
        return undefined;
    }

    return { evaluate };
}

function collectBindings(sourceFile, { pathBindings, urlBindings, constInitializers }) {
    const declaredNames = new Set();
    const visit = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const module = node.moduleSpecifier.text;
            const bindings = PATH_MODULES.has(module)
                ? pathBindings
                : URL_MODULES.has(module)
                  ? urlBindings
                  : undefined;
            const clause = node.importClause;
            if (bindings && clause && !clause.isTypeOnly) {
                if (clause.name) bindings.set(clause.name.text, "module");
                const named = clause.namedBindings;
                if (named && ts.isNamespaceImport(named)) bindings.set(named.name.text, "module");
                if (named && ts.isNamedImports(named)) {
                    for (const element of named.elements) {
                        const imported = (element.propertyName ?? element.name).text;
                        bindings.set(element.name.text, imported);
                    }
                }
            }
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            const name = node.name.text;
            const isConst =
                ts.isVariableDeclarationList(node.parent) &&
                (node.parent.flags & ts.NodeFlags.Const) !== 0;
            // A name declared twice, or by anything but a const, has no single value.
            if (declaredNames.has(name) || !isConst || !node.initializer) {
                constInitializers.delete(name);
            } else {
                constInitializers.set(name, node.initializer);
            }
            declaredNames.add(name);
        } else if (
            (ts.isParameter(node) || ts.isBindingElement(node)) &&
            ts.isIdentifier(node.name)
        ) {
            constInitializers.delete(node.name.text);
            declaredNames.add(node.name.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    for (const [name, imported] of pathBindings) {
        if (imported !== "module" && imported !== "posix" && !PATH_FUNCTIONS.has(imported)) {
            pathBindings.delete(name);
        }
    }
}
