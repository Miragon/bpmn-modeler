import * as ts from "typescript";

import { parseSource } from "./parseSource";

export interface FunctionComplexity {
    readonly name: string;
    readonly line: number;
    readonly complexity: number;
}

interface Unit {
    readonly name: string;
    readonly line: number;
    complexity: number;
}

type FunctionUnit =
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction
    | ts.MethodDeclaration
    | ts.ConstructorDeclaration
    | ts.AccessorDeclaration;

const LOGICAL_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
    ts.SyntaxKind.BarBarEqualsToken,
    ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const BRANCHES: ReadonlySet<ts.SyntaxKind> = new Set([
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.ConditionalExpression,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoStatement,
    ts.SyntaxKind.CatchClause,
    ts.SyntaxKind.CaseClause,
]);

function isFunctionUnit(node: ts.Node): node is FunctionUnit & { body: ts.Node } {
    return (
        (ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isConstructorDeclaration(node) ||
            ts.isGetAccessorDeclaration(node) ||
            ts.isSetAccessorDeclaration(node)) &&
        node.body !== undefined
    );
}

// ESLint gives only a `PropertyDefinition` value a code path; an auto-accessor is another node.
function isClassFieldInitializer(
    node: ts.Node,
): node is ts.PropertyDeclaration & { initializer: ts.Expression } {
    return (
        ts.isPropertyDeclaration(node) &&
        node.initializer !== undefined &&
        !(node.modifiers ?? []).some(({ kind }) => kind === ts.SyntaxKind.AccessorKeyword)
    );
}

function isDestructuringPattern(node: ts.Node): boolean {
    return ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node);
}

function isDefaultAssignment(node: ts.Node): node is ts.BinaryExpression {
    return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
}

/** ESTree's `AssignmentPattern`s inside a destructuring-assignment target. */
function assignmentTargetDefaults(target: ts.Node): number {
    if (ts.isArrayLiteralExpression(target)) {
        return target.elements.reduce((count, element) => count + elementDefaults(element), 0);
    }
    if (!ts.isObjectLiteralExpression(target)) {
        return 0;
    }
    return target.properties.reduce((count, property) => {
        if (ts.isShorthandPropertyAssignment(property)) {
            return count + (property.objectAssignmentInitializer === undefined ? 0 : 1);
        }
        if (ts.isPropertyAssignment(property)) {
            return count + elementDefaults(property.initializer);
        }
        return ts.isSpreadAssignment(property)
            ? count + assignmentTargetDefaults(property.expression)
            : count;
    }, 0);
}

function elementDefaults(element: ts.Node): number {
    // The walk reaches the default's own `target = value` and counts a pattern target there.
    if (isDefaultAssignment(element)) {
        return 1;
    }
    return ts.isSpreadElement(element)
        ? assignmentTargetDefaults(element.expression)
        : assignmentTargetDefaults(element);
}

function hasQuestionDot(node: ts.Node): boolean {
    return (
        (ts.isPropertyAccessExpression(node) ||
            ts.isElementAccessExpression(node) ||
            ts.isCallExpression(node)) &&
        node.questionDotToken !== undefined
    );
}

function increment(node: ts.Node): number {
    if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
        return (
            1 +
            (isDestructuringPattern(node.initializer)
                ? assignmentTargetDefaults(node.initializer)
                : 0)
        );
    }
    if (BRANCHES.has(node.kind) || hasQuestionDot(node)) {
        return 1;
    }
    if (ts.isBinaryExpression(node)) {
        if (LOGICAL_OPERATORS.has(node.operatorToken.kind)) {
            return 1;
        }
        return isDefaultAssignment(node) && isDestructuringPattern(node.left)
            ? assignmentTargetDefaults(node.left)
            : 0;
    }
    if (ts.isParameter(node) || ts.isBindingElement(node)) {
        return node.initializer === undefined ? 0 : 1;
    }
    return 0;
}

// An expression in a heritage clause is a value, though TypeScript files it as a type node.
function isTypeOnly(node: ts.Node): boolean {
    return ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node);
}

function propertyNameText(name: ts.Node | undefined): string | undefined {
    if (
        name !== undefined &&
        (ts.isIdentifier(name) ||
            ts.isPrivateIdentifier(name) ||
            ts.isStringLiteral(name) ||
            ts.isNumericLiteral(name))
    ) {
        return name.text;
    }
    return undefined;
}

// The cached trees carry no parent pointers, so the walk hands the parent down.
function holderName(parent: ts.Node): string | undefined {
    if (
        ts.isVariableDeclaration(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isPropertyDeclaration(parent)
    ) {
        return propertyNameText(parent.name);
    }
    return undefined;
}

function unitName(node: FunctionUnit, parent: ts.Node): string {
    if (ts.isConstructorDeclaration(node)) {
        return "constructor";
    }
    if (ts.isArrowFunction(node)) {
        return holderName(parent) ?? "anonymous";
    }
    return propertyNameText(node.name) ?? holderName(parent) ?? "anonymous";
}

function lineOf(sourceFile: ts.SourceFile, position: number): number {
    return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function unitPosition(node: FunctionUnit, sourceFile: ts.SourceFile): number {
    if (ts.isArrowFunction(node)) {
        return node.equalsGreaterThanToken.getStart(sourceFile);
    }
    return (node.name ?? node).getStart(sourceFile);
}

/**
 * Mirrors ESLint's `complexity` rule (classic variant): one unit per function with a body, class
 * field initializer and class static block, each starting at 1, a nested unit counted on its own
 * and top-level code not at all. In source order.
 */
export function readFunctionComplexities(fileName: string, text: string): FunctionComplexity[] {
    const sourceFile = parseSource(fileName, text);
    const units: Unit[] = [];
    const startUnit = (name: string, position: number): Unit => {
        const unit = { name, line: lineOf(sourceFile, position), complexity: 1 };
        units.push(unit);
        return unit;
    };

    const visit = (node: ts.Node, parent: ts.Node, current: Unit | undefined): void => {
        if (isTypeOnly(node)) {
            return;
        }
        // Decorators and a computed name run in the enclosing scope, so they count there.
        if (isFunctionUnit(node)) {
            node.modifiers?.forEach((modifier) => visit(modifier, node, current));
            if (node.name !== undefined) {
                visit(node.name, node, current);
            }
            const unit = startUnit(unitName(node, parent), unitPosition(node, sourceFile));
            node.parameters.forEach((parameter) => visit(parameter, node, unit));
            visit(node.body, node, unit);
            return;
        }
        if (isClassFieldInitializer(node)) {
            node.modifiers?.forEach((modifier) => visit(modifier, node, current));
            visit(node.name, node, current);
            const name = propertyNameText(node.name) ?? "anonymous";
            visit(node.initializer, node, startUnit(name, node.initializer.getStart(sourceFile)));
            return;
        }
        if (ts.isClassStaticBlockDeclaration(node)) {
            visit(node.body, node, startUnit("static block", node.getStart(sourceFile)));
            return;
        }
        if (current !== undefined) {
            current.complexity += increment(node);
        }
        ts.forEachChild(node, (child) => visit(child, node, current));
    };
    visit(sourceFile, sourceFile, undefined);
    return units.map(({ name, line, complexity }) => ({ name, line, complexity }));
}

function markTokenLines(node: ts.Node, sourceFile: ts.SourceFile, codeLines: Set<number>): void {
    if (node.kind === ts.SyntaxKind.JsxText) {
        const start = node.getStart(sourceFile);
        node.getText(sourceFile)
            .split("\n")
            .reduce((offset, line) => {
                if (line.trim() !== "") {
                    codeLines.add(lineOf(sourceFile, start + offset));
                }
                return offset + line.length + 1;
            }, 0);
        return;
    }
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    if (start === end) {
        return;
    }
    for (let line = lineOf(sourceFile, start); line <= lineOf(sourceFile, end - 1); line++) {
        codeLines.add(line);
    }
}

/** cloc's code lines: lines with at least one token that is not a comment or blank. */
export function readCodeLines(fileName: string, text: string): number {
    const sourceFile = parseSource(fileName, text);
    const codeLines = new Set<number>();
    const visit = (node: ts.Node): void => {
        const children = node.getChildren(sourceFile);
        if (children.length === 0) {
            markTokenLines(node, sourceFile, codeLines);
        }
        children.forEach(visit);
    };
    visit(sourceFile);
    return codeLines.size;
}
