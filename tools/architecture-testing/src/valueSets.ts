import * as ts from "typescript";

import { parseSource } from "./parseSource";

export interface ValueSetLiteral {
    readonly line: number;
    readonly values: readonly string[];
}

function isPlainString(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function unwrapParentheses(node: ts.Expression): ts.Expression {
    return ts.isParenthesizedExpression(node) ? unwrapParentheses(node.expression) : node;
}

function isOrChain(node: ts.Node): node is ts.BinaryExpression {
    return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken;
}

function orOperands(node: ts.Expression): ts.Expression[] {
    const unwrapped = unwrapParentheses(node);
    return isOrChain(unwrapped)
        ? [...orOperands(unwrapped.left), ...orOperands(unwrapped.right)]
        : [unwrapped];
}

interface StringComparison {
    readonly subject: string;
    readonly value: string;
}

function stringComparison(node: ts.Expression, tree: ts.SourceFile): StringComparison | undefined {
    if (
        !ts.isBinaryExpression(node) ||
        node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
    ) {
        return undefined;
    }
    const { left, right } = node;
    if (isPlainString(right) && !isPlainString(left)) {
        return { subject: left.getText(tree), value: right.text };
    }
    if (isPlainString(left) && !isPlainString(right)) {
        return { subject: right.getText(tree), value: left.text };
    }
    return undefined;
}

function chainValues(chain: ts.BinaryExpression, tree: ts.SourceFile): string[] | undefined {
    const comparisons = orOperands(chain).map((operand) => stringComparison(operand, tree));
    if (
        !comparisons.every((comparison): comparison is StringComparison => comparison !== undefined)
    ) {
        return undefined;
    }
    const [first] = comparisons;
    return comparisons.every(({ subject }) => subject === first.subject)
        ? comparisons.map(({ value }) => value)
        : undefined;
}

function definedOrNothing(values: readonly (string | undefined)[]): string[] | undefined {
    return values.length > 0 && values.every((value) => value !== undefined)
        ? [...values]
        : undefined;
}

function arrayValues(node: ts.ArrayLiteralExpression): string[] | undefined {
    return definedOrNothing(
        node.elements.map((element) => (isPlainString(element) ? element.text : undefined)),
    );
}

function unionValues(node: ts.UnionTypeNode): string[] | undefined {
    return definedOrNothing(
        node.types.map((member) =>
            ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)
                ? member.literal.text
                : undefined,
        ),
    );
}

function valuesOf(node: ts.Node, tree: ts.SourceFile): string[] | undefined {
    if (ts.isArrayLiteralExpression(node)) {
        return arrayValues(node);
    }
    if (ts.isUnionTypeNode(node)) {
        return unionValues(node);
    }
    return isOrChain(node) ? chainValues(node, tree) : undefined;
}

/** Syntax only: a set is read where it is written, never through a type or a constant it names. */
export function readValueSets(fileName: string, text: string): ValueSetLiteral[] {
    const tree = parseSource(fileName, text);
    const sets: ValueSetLiteral[] = [];
    const visit = (node: ts.Node): void => {
        const values = valuesOf(node, tree);
        if (values !== undefined) {
            const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
            sets.push({ line: line + 1, values });
        }
        // Only the maximal chain is a set; the parse has no parent pointers to tell a nested one later.
        if (isOrChain(node)) {
            orOperands(node).forEach(visit);
        } else {
            ts.forEachChild(node, visit);
        }
    };
    visit(tree);
    return sets;
}
