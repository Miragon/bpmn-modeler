import * as ts from "typescript";

import { parseSource } from "./parseSource";

/**
 * Every top-level statement is an import, an export list, a type or a `const`
 * whose value computes nothing: a literal, a name, a property read, or an
 * array, object or template of those. Such a module holds data, types or
 * re-exports, and no logic.
 */
export function runsNoCode(fileName: string, text: string): boolean {
    return parseSource(fileName, text).statements.every(
        (statement) =>
            ts.isImportDeclaration(statement) ||
            ts.isExportDeclaration(statement) ||
            ts.isInterfaceDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement) ||
            ts.isEmptyStatement(statement) ||
            isDataConstant(statement),
    );
}

function isDataConstant(statement: ts.Statement): boolean {
    return (
        ts.isVariableStatement(statement) &&
        (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
        statement.declarationList.declarations.every(
            ({ initializer }) => initializer === undefined || computesNothing(initializer),
        )
    );
}

function computesNothing(expression: ts.Expression): boolean {
    if (
        ts.isParenthesizedExpression(expression) ||
        ts.isAsExpression(expression) ||
        ts.isSatisfiesExpression(expression) ||
        ts.isNonNullExpression(expression) ||
        ts.isPropertyAccessExpression(expression)
    ) {
        return computesNothing(expression.expression);
    }
    if (ts.isPrefixUnaryExpression(expression)) {
        return ts.isNumericLiteral(expression.operand);
    }
    if (ts.isTemplateExpression(expression)) {
        return expression.templateSpans.every((span) => computesNothing(span.expression));
    }
    if (ts.isArrayLiteralExpression(expression)) {
        return expression.elements.every(isDataElement);
    }
    if (ts.isObjectLiteralExpression(expression)) {
        return expression.properties.every(isDataProperty);
    }
    return (
        ts.isIdentifier(expression) ||
        ts.isLiteralExpression(expression) ||
        expression.kind === ts.SyntaxKind.TrueKeyword ||
        expression.kind === ts.SyntaxKind.FalseKeyword ||
        expression.kind === ts.SyntaxKind.NullKeyword
    );
}

function isDataElement(element: ts.Expression): boolean {
    if (ts.isSpreadElement(element)) {
        return computesNothing(element.expression);
    }
    return ts.isOmittedExpression(element) || computesNothing(element);
}

function isDataProperty(property: ts.ObjectLiteralElementLike): boolean {
    if (ts.isShorthandPropertyAssignment(property)) {
        return true;
    }
    if (ts.isSpreadAssignment(property)) {
        return computesNothing(property.expression);
    }
    return (
        ts.isPropertyAssignment(property) &&
        (!ts.isComputedPropertyName(property.name) || computesNothing(property.name.expression)) &&
        computesNothing(property.initializer)
    );
}
