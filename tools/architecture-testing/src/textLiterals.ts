import * as ts from "typescript";

import { parseSource } from "./parseSource";

/** A call or `new` named as written: `this.logger.info(…)` calls `info` on `logger`. */
export interface CallSite {
    readonly construct: boolean;
    /** Unset when the callee is neither a name nor a property, such as `handlers[0]`. */
    readonly callee?: string;
    /** Unset for a bare name and for a property of `this` or of a call's result. */
    readonly receiver?: string;
    /** Kotlin, which constructs without `new`: the call is what a `throw` raises. */
    readonly thrown?: boolean;
}

export interface TextLiteral {
    readonly line: number;
    /** One for a plain literal; a template's literal stretches around its placeholders, in order. */
    readonly parts: readonly string[];
    /**
     * Every call and `new` whose arguments hold the literal, outermost first, up to
     * the nearest function or lambda around it: code a callee runs is no value it is handed.
     */
    readonly argumentOf: readonly CallSite[];
}

function unwrap(expression: ts.Expression): ts.Expression {
    return ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)
        ? unwrap(expression.expression)
        : expression;
}

function nameOf(expression: ts.Expression): string | undefined {
    const target = unwrap(expression);
    if (ts.isIdentifier(target)) {
        return target.text;
    }
    return ts.isPropertyAccessExpression(target) ? target.name.text : undefined;
}

function callSiteOf(call: ts.CallExpression | ts.NewExpression): CallSite {
    const construct = ts.isNewExpression(call);
    const callee = unwrap(call.expression);
    if (!ts.isPropertyAccessExpression(callee)) {
        const name = nameOf(callee);
        return name === undefined ? { construct } : { construct, callee: name };
    }
    const receiver = nameOf(callee.expression);
    return receiver === undefined
        ? { construct, callee: callee.name.text }
        : { construct, callee: callee.name.text, receiver };
}

function partsOf(node: ts.Node): string[] | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return [node.text];
    }
    return ts.isTemplateExpression(node)
        ? [node.head.text, ...node.templateSpans.map(({ literal }) => literal.text)]
        : undefined;
}

// A type and a module specifier are no text a program shows.
function holdsNoText(node: ts.Node): boolean {
    return (
        ts.isTypeNode(node) ||
        ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node)
    );
}

/**
 * The string and template literals of values.
 * Syntax only: a literal is read where it is written, never through a constant it names.
 */
export function readTextLiterals(fileName: string, text: string): TextLiteral[] {
    const tree = parseSource(fileName, text);
    const literals: TextLiteral[] = [];
    // The parse has no parent pointers, so the calls around a node travel down with it.
    const visit = (node: ts.Node, argumentOf: readonly CallSite[]): void => {
        if (holdsNoText(node)) {
            return;
        }
        const parts = partsOf(node);
        if (parts !== undefined) {
            const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
            literals.push({ line: line + 1, parts, argumentOf });
        }
        if (ts.isFunctionLike(node)) {
            ts.forEachChild(node, (child) => visit(child, []));
            return;
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            const inCall = [...argumentOf, callSiteOf(node)];
            visit(node.expression, argumentOf);
            for (const argument of node.arguments ?? []) {
                visit(argument, inCall);
            }
            return;
        }
        ts.forEachChild(node, (child) => visit(child, argumentOf));
    };
    visit(tree, []);
    return literals;
}
