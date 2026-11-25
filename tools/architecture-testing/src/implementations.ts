import * as ts from "typescript";

import { compareText } from "./compareText";
import { DeclarationFinder } from "./declarationGraph";
import { type ImportedBinding, importedBindings } from "./moduleSymbols";
import { parseSource } from "./parseSource";
import type { PathAlias } from "./pathAliases";
import type { SourceFile } from "./sourceTree";

export interface ClassImplementation {
    readonly path: string;
    readonly line: number;
    /** Unset for an anonymous class expression. */
    readonly className?: string;
    /** The files that declare its implemented interfaces; a global or unresolved one adds none. */
    readonly interfaceFiles: readonly string[];
    /** The files that build it with `new`; an anonymous class is built where it is declared, if at all. */
    readonly constructedIn: readonly string[];
    /** Per file declaring an implemented interface, the files with a parameter whose type names one or whose default value builds the class, whatever its type. */
    readonly receivedIn: readonly {
        readonly interfaceFile: string;
        readonly files: readonly string[];
    }[];
}

export interface ImplementationOptions {
    readonly aliases?: readonly PathAlias[];
}

/** Syntax only, so a checkout without `node_modules` reads the same as the working tree. */
export function findImplementations(
    tree: readonly SourceFile[],
    { aliases = [] }: ImplementationOptions = {},
): ClassImplementation[] {
    const declarations = DeclarationFinder.of(tree, { aliases });
    const files = tree.map(({ path, text }) => {
        const sourceFile = parseSource(path, text);
        return { path, sourceFile, resolver: new SymbolResolver(path, sourceFile, declarations) };
    });
    const constructions = Constructions.in(files);
    const parameterTypes = ParameterTypes.in(files);
    return files.flatMap(({ path, sourceFile, resolver }) =>
        implementingClasses(sourceFile).map((declaration) => {
            const interfaces = implementedExpressions(declaration).flatMap((expression) =>
                resolver.declarations(expression),
            );
            const interfaceFiles = [...new Set(interfaces.map(({ file }) => file))].sort(
                compareText,
            );
            const line =
                sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
            const constructedIn = constructions.of(path, declaration);
            const builtAsDefaultIn = parameterTypes.filesDefaultingTo(path, declaration);
            const receivedIn = interfaceFiles
                .map((interfaceFile) => ({
                    interfaceFile,
                    files: [
                        ...new Set([
                            ...parameterTypes.filesNaming(
                                interfaces.filter(({ file }) => file === interfaceFile),
                            ),
                            ...builtAsDefaultIn,
                        ]),
                    ].sort(compareText),
                }))
                .filter(({ files }) => files.length > 0);
            return declaration.name === undefined
                ? { path, line, interfaceFiles, constructedIn, receivedIn }
                : {
                      path,
                      line,
                      className: declaration.name.text,
                      interfaceFiles,
                      constructedIn,
                      receivedIn,
                  };
        }),
    );
}

interface ResolvedFile {
    readonly path: string;
    readonly sourceFile: ts.SourceFile;
    readonly resolver: SymbolResolver;
}

interface Declaration {
    readonly file: string;
    readonly name: string;
}

class Constructions {
    private constructor(
        private readonly filesByDeclaration: ReadonlyMap<string, ReadonlySet<string>>,
        private readonly builtInPlace: ReadonlySet<ts.Node>,
    ) {}

    static in(files: readonly ResolvedFile[]): Constructions {
        const filesByDeclaration = new Map<string, Set<string>>();
        const builtInPlace = new Set<ts.Node>();
        for (const { path, sourceFile, resolver } of files) {
            const visit = (node: ts.Node): void => {
                if (ts.isNewExpression(node)) {
                    const built = withoutParentheses(node.expression);
                    if (ts.isClassExpression(built)) {
                        builtInPlace.add(built);
                    }
                    for (const { file, name } of resolver.declarations(built)) {
                        const key = declarationKey(file, name);
                        filesByDeclaration.set(
                            key,
                            (filesByDeclaration.get(key) ?? new Set()).add(path),
                        );
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(sourceFile);
        }
        return new Constructions(filesByDeclaration, builtInPlace);
    }

    of(path: string, declaration: ts.ClassLikeDeclaration): string[] {
        if (declaration.name === undefined) {
            return this.builtInPlace.has(declaration) ? [path] : [];
        }
        const files = this.filesByDeclaration.get(declarationKey(path, declaration.name.text));
        return [...(files ?? [])].sort(compareText);
    }
}

/**
 * Every type a parameter's annotation names, however nested: a union, an object type or a generic
 * argument; and every class a parameter's default builds, however the parameter is typed, since a
 * caller may pass another implementation in its place.
 */
class ParameterTypes {
    private constructor(
        private readonly filesByDeclaration: ReadonlyMap<string, ReadonlySet<string>>,
        private readonly filesByDefaultClass: ReadonlyMap<string, ReadonlySet<string>>,
        private readonly filesByDefaultClassExpression: ReadonlyMap<ts.Node, ReadonlySet<string>>,
    ) {}

    static in(files: readonly ResolvedFile[]): ParameterTypes {
        const filesByDeclaration = new Map<string, Set<string>>();
        const filesByDefaultClass = new Map<string, Set<string>>();
        const filesByDefaultClassExpression = new Map<ts.Node, Set<string>>();
        for (const { path, sourceFile, resolver } of files) {
            const visitType = (node: ts.Node): void => {
                if (ts.isTypeReferenceNode(node)) {
                    for (const { file, name } of resolver.typeDeclarations(node.typeName)) {
                        const key = declarationKey(file, name);
                        filesByDeclaration.set(
                            key,
                            (filesByDeclaration.get(key) ?? new Set()).add(path),
                        );
                    }
                }
                ts.forEachChild(node, visitType);
            };
            const visitDefault = (initializer: ts.Expression): void => {
                const value = withoutParentheses(initializer);
                if (!ts.isNewExpression(value)) {
                    return;
                }
                const built = withoutParentheses(value.expression);
                if (ts.isClassExpression(built)) {
                    filesByDefaultClassExpression.set(
                        built,
                        (filesByDefaultClassExpression.get(built) ?? new Set()).add(path),
                    );
                }
                for (const { file, name } of resolver.declarations(built)) {
                    const key = declarationKey(file, name);
                    filesByDefaultClass.set(
                        key,
                        (filesByDefaultClass.get(key) ?? new Set()).add(path),
                    );
                }
            };
            const visit = (node: ts.Node): void => {
                if (ts.isParameter(node)) {
                    if (node.type !== undefined) {
                        visitType(node.type);
                    }
                    if (node.initializer !== undefined) {
                        visitDefault(node.initializer);
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(sourceFile);
        }
        return new ParameterTypes(
            filesByDeclaration,
            filesByDefaultClass,
            filesByDefaultClassExpression,
        );
    }

    filesDefaultingTo(path: string, declaration: ts.ClassLikeDeclaration): string[] {
        const files =
            declaration.name === undefined
                ? this.filesByDefaultClassExpression.get(declaration)
                : this.filesByDefaultClass.get(declarationKey(path, declaration.name.text));
        return [...(files ?? [])];
    }

    filesNaming(declarations: readonly Declaration[]): string[] {
        const files = declarations.flatMap(({ file, name }) => [
            ...(this.filesByDeclaration.get(declarationKey(file, name)) ?? []),
        ]);
        return [...new Set(files)].sort(compareText);
    }
}

function withoutParentheses(expression: ts.Expression): ts.Expression {
    return ts.isParenthesizedExpression(expression)
        ? withoutParentheses(expression.expression)
        : expression;
}

function declarationKey(file: string, name: string): string {
    return `${file}#${name}`;
}

/** Resolves a name in a file, or a member of a namespace import, to where it is declared. */
class SymbolResolver {
    private readonly bindings: ReadonlyMap<string, ImportedBinding>;
    private readonly localNames: ReadonlySet<string>;

    constructor(
        private readonly path: string,
        sourceFile: ts.SourceFile,
        private readonly finder: DeclarationFinder,
    ) {
        this.bindings = importedBindings(sourceFile);
        this.localNames = new Set(sourceFile.statements.flatMap(declaredTypeName));
    }

    declarations(expression: ts.Expression): Declaration[] {
        if (ts.isIdentifier(expression)) {
            return this.identifierDeclarations(expression.text);
        }
        if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
            return this.namespaceMemberDeclarations(
                expression.expression.text,
                expression.name.text,
            );
        }
        return [];
    }

    typeDeclarations(name: ts.EntityName): Declaration[] {
        if (ts.isIdentifier(name)) {
            return this.identifierDeclarations(name.text);
        }
        return ts.isIdentifier(name.left)
            ? this.namespaceMemberDeclarations(name.left.text, name.right.text)
            : [];
    }

    private namespaceMemberDeclarations(namespace: string, member: string): Declaration[] {
        const binding = this.bindings.get(namespace);
        return binding === undefined || binding.imported !== undefined
            ? []
            : this.imported(binding.specifier, member);
    }

    private identifierDeclarations(name: string): Declaration[] {
        const binding = this.bindings.get(name);
        if (binding === undefined) {
            return this.localNames.has(name) ? [{ file: this.path, name }] : [];
        }
        return binding.imported === undefined
            ? []
            : this.imported(binding.specifier, binding.imported);
    }

    private imported(specifier: string, name: string): Declaration[] {
        return this.finder
            .declaringFiles(this.path, specifier, name)
            .map((file) => ({ file, name }));
    }
}

function implementingClasses(sourceFile: ts.SourceFile): ts.ClassLikeDeclaration[] {
    const classes: ts.ClassLikeDeclaration[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isClassLike(node) && implementedExpressions(node).length > 0) {
            classes.push(node);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return classes;
}

function implementedExpressions(declaration: ts.ClassLikeDeclaration): ts.Expression[] {
    return (declaration.heritageClauses ?? [])
        .filter(({ token }) => token === ts.SyntaxKind.ImplementsKeyword)
        .flatMap(({ types }) => types.map(({ expression }) => expression));
}

function declaredTypeName(statement: ts.Statement): string[] {
    return (ts.isInterfaceDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
        statement.name !== undefined
        ? [statement.name.text]
        : [];
}
