import * as ts from "typescript";

export interface ContractSuiteScope {
    /** A port is an interface declared at the top level of a file this accepts. */
    readonly isPortFile: (fileName: string) => boolean;
    /** An adapter is a named class in a file this accepts whose `implements` clause reaches a port. */
    readonly isAdapterFile: (fileName: string) => boolean;
    readonly isSpecFile: (fileName: string) => boolean;
    /** The module whose exported functions are the contract helpers. */
    readonly helperModule: string;
}

/** Shown in a report; the engine matches symbols, never names. */
export interface DeclarationName {
    readonly fileName: string;
    readonly name: string;
}

export interface PortMember {
    readonly name: string;
    /** Every call signature returns `void` or a promise of it; a property that is no function returns a value. */
    readonly returnsNothing: boolean;
}

export interface PortDeclaration extends DeclarationName {
    readonly line: number;
    /** Inherited members included. */
    readonly members: readonly PortMember[];
}

export interface PortAdapter extends DeclarationName {
    readonly line: number;
    /** Through the interfaces its implemented interfaces extend, and the parts of an implemented intersection. */
    readonly ports: readonly DeclarationName[];
}

export interface ContractHelper extends DeclarationName {
    /** The ports a parameter produces: a factory returning the port, or returning an object one of whose properties holds it; a type parameter counts as its constraint. */
    readonly ports: readonly DeclarationName[];
}

/** Only a spec that imports an adapter as a value is listed. */
export interface AdapterSpec {
    readonly fileName: string;
    readonly adapters: readonly DeclarationName[];
    readonly helpers: readonly DeclarationName[];
}

export interface ContractSuites {
    readonly ports: readonly PortDeclaration[];
    readonly adapters: readonly PortAdapter[];
    readonly helpers: readonly ContractHelper[];
    readonly specs: readonly AdapterSpec[];
}

export function findContractSuites(program: ts.Program, scope: ContractSuiteScope): ContractSuites {
    const reader = new ContractSuiteReader(program.getTypeChecker());
    const sourceFiles = program.getSourceFiles();
    const helperModule = program.getSourceFile(scope.helperModule);
    if (helperModule === undefined) {
        // A moved helper module would otherwise leave every adapter without a suite.
        throw new Error(`${scope.helperModule} is not in the program`);
    }
    const ports = new Map<ts.Symbol, PortDeclaration>();
    for (const sourceFile of sourceFiles.filter(({ fileName }) => scope.isPortFile(fileName))) {
        for (const [symbol, port] of reader.portsDeclaredIn(sourceFile)) {
            if (!ports.has(symbol)) {
                ports.set(symbol, port);
            }
        }
    }
    const adapters = new Map<ts.Symbol, PortAdapter>(
        sourceFiles
            .filter(({ fileName }) => scope.isAdapterFile(fileName))
            .flatMap((sourceFile) => reader.adaptersIn(sourceFile, ports)),
    );
    const helpers = reader.helpersExportedBy(helperModule, ports);
    return {
        ports: [...ports.values()],
        adapters: [...adapters.values()],
        helpers: [...helpers.values()],
        specs: sourceFiles
            .filter(({ fileName }) => scope.isSpecFile(fileName))
            .flatMap((sourceFile) => reader.specOf(sourceFile, adapters, helpers)),
    };
}

class ContractSuiteReader {
    constructor(private readonly checker: ts.TypeChecker) {}

    portsDeclaredIn(sourceFile: ts.SourceFile): [ts.Symbol, PortDeclaration][] {
        return sourceFile.statements.filter(ts.isInterfaceDeclaration).map((declaration) => {
            const symbol = this.checker.getSymbolAtLocation(declaration.name) as ts.Symbol;
            const members = this.checker
                .getPropertiesOfType(this.checker.getDeclaredTypeOfSymbol(symbol))
                .map((member) => ({
                    name: member.name,
                    returnsNothing: this.returnsNothing(member),
                }));
            return [
                symbol,
                {
                    fileName: sourceFile.fileName,
                    name: declaration.name.text,
                    line: lineOf(sourceFile, declaration),
                    members,
                },
            ];
        });
    }

    adaptersIn(
        sourceFile: ts.SourceFile,
        ports: ReadonlyMap<ts.Symbol, PortDeclaration>,
    ): [ts.Symbol, PortAdapter][] {
        return namedImplementingClasses(sourceFile).flatMap((declaration) => {
            const implemented = implementedTypes(declaration).flatMap((expression) =>
                this.portsReachedBy(this.checker.getTypeAtLocation(expression), ports),
            );
            if (implemented.length === 0) {
                return [];
            }
            const symbol = this.checker.getSymbolAtLocation(declaration.name) as ts.Symbol;
            return [
                [
                    symbol,
                    {
                        fileName: sourceFile.fileName,
                        name: declaration.name.text,
                        line: lineOf(sourceFile, declaration),
                        ports: [...new Set(implemented)].map(nameOf),
                    },
                ],
            ];
        });
    }

    helpersExportedBy(
        helperModule: ts.SourceFile,
        ports: ReadonlyMap<ts.Symbol, PortDeclaration>,
    ): Map<ts.Symbol, ContractHelper> {
        const helpers = new Map<ts.Symbol, ContractHelper>();
        const moduleSymbol = this.checker.getSymbolAtLocation(helperModule);
        const exported =
            moduleSymbol === undefined ? [] : this.checker.getExportsOfModule(moduleSymbol);
        for (const symbol of exported.map((candidate) => this.resolved(candidate))) {
            const declaration = symbol.valueDeclaration;
            if (declaration === undefined || helpers.has(symbol)) {
                continue;
            }
            const produced = this.checker
                .getTypeOfSymbolAtLocation(symbol, declaration)
                .getCallSignatures()
                .flatMap((signature) => signature.getParameters())
                .flatMap((parameter) =>
                    this.producedPorts(
                        this.checker.getTypeOfSymbolAtLocation(parameter, declaration),
                        ports,
                    ),
                );
            if (produced.length > 0) {
                helpers.set(symbol, {
                    fileName: declaration.getSourceFile().fileName,
                    name: symbol.name,
                    ports: [...new Set(produced)].map(nameOf),
                });
            }
        }
        return helpers;
    }

    specOf(
        sourceFile: ts.SourceFile,
        adapters: ReadonlyMap<ts.Symbol, PortAdapter>,
        helpers: ReadonlyMap<ts.Symbol, ContractHelper>,
    ): AdapterSpec[] {
        const imported = valueImportNames(sourceFile).flatMap((name) =>
            this.lookUp(this.checker.getSymbolAtLocation(name), adapters),
        );
        if (imported.length === 0) {
            return [];
        }
        const called = callees(sourceFile).flatMap((callee) =>
            this.lookUp(this.checker.getSymbolAtLocation(callee), helpers),
        );
        return [
            {
                fileName: sourceFile.fileName,
                adapters: [...new Set(imported)].map(nameOf),
                helpers: [...new Set(called)].map(nameOf),
            },
        ];
    }

    private returnsNothing(member: ts.Symbol): boolean {
        const signatures = this.checker
            .getNonNullableType(this.checker.getTypeOfSymbol(member))
            .getCallSignatures();
        return (
            signatures.length > 0 &&
            signatures.every((signature) => isVoid(this.awaited(signature.getReturnType())))
        );
    }

    private producedPorts(
        parameterType: ts.Type,
        ports: ReadonlyMap<ts.Symbol, PortDeclaration>,
    ): PortDeclaration[] {
        return this.checker
            .getNonNullableType(parameterType)
            .getCallSignatures()
            .flatMap((signature) => constituents(this.awaited(signature.getReturnType())))
            .flatMap((product) => [
                product,
                ...this.checker
                    .getPropertiesOfType(product)
                    .flatMap((property) =>
                        constituents(
                            this.checker.getNonNullableType(this.checker.getTypeOfSymbol(property)),
                        ),
                    ),
            ])
            .flatMap((type) => this.portsReachedBy(type, ports));
    }

    /** A type parameter reaches what its constraint reaches, an intersection what each part does. */
    private portsReachedBy(
        type: ts.Type,
        ports: ReadonlyMap<ts.Symbol, PortDeclaration>,
    ): PortDeclaration[] {
        // A flag test, as the type guard isTypeParameter() narrows every other type to never.
        if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
            const constraint = this.checker.getBaseConstraintOfType(type);
            return constraint === undefined ? [] : this.portsReachedBy(constraint, ports);
        }
        if (type.isIntersection()) {
            return type.types.flatMap((part) => this.portsReachedBy(part, ports));
        }
        return [...this.declaredTypes(type)].flatMap((symbol) => {
            const port = ports.get(symbol);
            return port === undefined ? [] : [port];
        });
    }

    /** The type's own symbol and those of every interface or class it extends. */
    private declaredTypes(type: ts.Type, found = new Set<ts.Symbol>()): Set<ts.Symbol> {
        const target = isTypeReference(type) ? type.target : type;
        const symbol = target.getSymbol();
        if (symbol === undefined || found.has(symbol)) {
            return found;
        }
        found.add(symbol);
        if (isObjectType(target) && (target.objectFlags & ts.ObjectFlags.ClassOrInterface) !== 0) {
            for (const base of this.checker.getBaseTypes(target as ts.InterfaceType)) {
                this.declaredTypes(base, found);
            }
        }
        return found;
    }

    private awaited(type: ts.Type): ts.Type {
        return this.checker.getAwaitedType(type) ?? type;
    }

    private resolved(symbol: ts.Symbol): ts.Symbol {
        return (symbol.flags & ts.SymbolFlags.Alias) === 0
            ? symbol
            : this.checker.getAliasedSymbol(symbol);
    }

    private lookUp<T>(symbol: ts.Symbol | undefined, found: ReadonlyMap<ts.Symbol, T>): T[] {
        const value = symbol === undefined ? undefined : found.get(this.resolved(symbol));
        return value === undefined ? [] : [value];
    }
}

function nameOf({ fileName, name }: DeclarationName): DeclarationName {
    return { fileName, name };
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function constituents(type: ts.Type): readonly ts.Type[] {
    return type.isUnion() ? type.types : [type];
}

function isVoid(type: ts.Type): boolean {
    return constituents(type).every(({ flags }) => (flags & ts.TypeFlags.Void) !== 0);
}

function isObjectType(type: ts.Type): type is ts.ObjectType {
    return (type.flags & ts.TypeFlags.Object) !== 0;
}

function isTypeReference(type: ts.Type): type is ts.TypeReference {
    return isObjectType(type) && (type.objectFlags & ts.ObjectFlags.Reference) !== 0;
}

type NamedClass = ts.ClassLikeDeclaration & { readonly name: ts.Identifier };

function namedImplementingClasses(sourceFile: ts.SourceFile): NamedClass[] {
    const classes: NamedClass[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isClassLike(node) && node.name !== undefined && implementedTypes(node).length > 0) {
            classes.push(node as NamedClass);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return classes;
}

function implementedTypes(declaration: ts.ClassLikeDeclaration): ts.ExpressionWithTypeArguments[] {
    return (declaration.heritageClauses ?? [])
        .filter(({ token }) => token === ts.SyntaxKind.ImplementsKeyword)
        .flatMap(({ types }) => [...types]);
}

/** Default and named import bindings; a type-only one cannot construct an adapter. */
function valueImportNames(sourceFile: ts.SourceFile): ts.Identifier[] {
    return sourceFile.statements.filter(ts.isImportDeclaration).flatMap(({ importClause }) => {
        if (importClause === undefined || importClause.isTypeOnly) {
            return [];
        }
        const { name, namedBindings } = importClause;
        const named =
            namedBindings !== undefined && ts.isNamedImports(namedBindings)
                ? namedBindings.elements.filter(({ isTypeOnly }) => !isTypeOnly)
                : [];
        return [...(name === undefined ? [] : [name]), ...named.map((element) => element.name)];
    });
}

function callees(sourceFile: ts.SourceFile): ts.Expression[] {
    const found: ts.Expression[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            found.push(node.expression);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
}
