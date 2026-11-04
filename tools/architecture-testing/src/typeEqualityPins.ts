import * as ts from "typescript";

import { compareText } from "./compareText";
import { DeclarationFinder } from "./declarationGraph";
import { type ImportedBinding, importedBindings } from "./moduleSymbols";
import { parseSource } from "./parseSource";
import type { PathAlias } from "./pathAliases";
import type { SourceFile } from "./sourceTree";

export interface TypeEqualityPin {
    readonly path: string;
    readonly line: number;
    /** The files that declare the imported names `expectTypeOf` holds; a local or unresolved name adds none. */
    readonly actualFiles: readonly string[];
    /** The files that declare the imported names `toEqualTypeOf` holds. */
    readonly expectedFiles: readonly string[];
}

export interface TypeEqualityPinOptions {
    readonly aliases?: readonly PathAlias[];
}

interface ImportedName {
    readonly specifier: string;
    readonly imported: string;
}

interface AssertionSides {
    readonly assertion: ts.CallExpression;
    readonly actual: ts.Node;
    readonly expected: ts.Node;
}

const ASSERTION = "toEqualTypeOf";

/** Syntax only: `expectTypeOf<A>().toEqualTypeOf<B>()` or its value form, never behind `.not`. */
export function findTypeEqualityPins(
    tree: readonly SourceFile[],
    { aliases = [] }: TypeEqualityPinOptions = {},
): TypeEqualityPin[] {
    const candidates = tree.filter(({ text }) => text.includes(ASSERTION));
    if (candidates.length === 0) {
        return [];
    }
    const declarations = DeclarationFinder.of(tree, { aliases });
    return candidates.flatMap(({ path, text }) => {
        const sourceFile = parseSource(path, text);
        const bindings = importedBindings(sourceFile);
        const declaringFiles = (side: ts.Node): string[] =>
            [
                ...new Set(
                    importedNames(side, bindings).flatMap(({ specifier, imported }) =>
                        declarations.declaringFiles(path, specifier, imported),
                    ),
                ),
            ].sort(compareText);
        return typeEqualityAssertions(sourceFile).map(({ assertion, actual, expected }) => ({
            path,
            line: sourceFile.getLineAndCharacterOfPosition(assertion.getStart(sourceFile)).line + 1,
            actualFiles: declaringFiles(actual),
            expectedFiles: declaringFiles(expected),
        }));
    });
}

function typeEqualityAssertions(sourceFile: ts.SourceFile): AssertionSides[] {
    const assertions: AssertionSides[] = [];
    const visit = (node: ts.Node): void => {
        const sides = assertionSides(node);
        if (sides !== undefined) {
            assertions.push(sides);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return assertions;
}

function assertionSides(node: ts.Node): AssertionSides | undefined {
    if (
        !ts.isCallExpression(node) ||
        !ts.isPropertyAccessExpression(node.expression) ||
        node.expression.name.text !== ASSERTION
    ) {
        return undefined;
    }
    const subject = node.expression.expression;
    if (
        !ts.isCallExpression(subject) ||
        !ts.isIdentifier(subject.expression) ||
        subject.expression.text !== "expectTypeOf"
    ) {
        return undefined;
    }
    const actual = assertedSide(subject);
    const expected = assertedSide(node);
    return actual === undefined || expected === undefined
        ? undefined
        : { assertion: subject, actual, expected };
}

function assertedSide(call: ts.CallExpression): ts.Node | undefined {
    return call.typeArguments?.[0] ?? call.arguments[0];
}

function importedNames(
    side: ts.Node,
    bindings: ReadonlyMap<string, ImportedBinding>,
): ImportedName[] {
    const names: ImportedName[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) {
            const binding = bindings.get(node.text);
            if (binding?.imported !== undefined) {
                names.push({ specifier: binding.specifier, imported: binding.imported });
            }
            return;
        }
        const member = memberAccess(node);
        if (member === undefined) {
            ts.forEachChild(node, visit);
            return;
        }
        const namespace = ts.isIdentifier(member.owner)
            ? bindings.get(member.owner.text)
            : undefined;
        if (namespace !== undefined && namespace.imported === undefined) {
            names.push({ specifier: namespace.specifier, imported: member.name });
        } else {
            visit(member.owner);
        }
    };
    visit(side);
    return names;
}

// The member name is not a binding of the file, so only its owner may name an import.
function memberAccess(node: ts.Node): { owner: ts.Node; name: string } | undefined {
    if (ts.isQualifiedName(node)) {
        return { owner: node.left, name: node.right.text };
    }
    return ts.isPropertyAccessExpression(node)
        ? { owner: node.expression, name: node.name.text }
        : undefined;
}
