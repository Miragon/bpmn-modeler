import * as ts from "typescript";

export interface ContractSuiteScope {
    /** A port is an interface declared at the top level of a file this accepts. */
    readonly isPortFile: (fileName: string) => boolean;
    /**
     * An adapter is a named class in a file this accepts that reaches a port: by its `implements`
     * clause, or because such a file hands it over where the port is expected.
     */
    readonly isAdapterFile: (fileName: string) => boolean;
    /** An adapter file this accepts may also hold an object literal adapter, named by its variable or function. */
    readonly isLiteralAdapterFile: (fileName: string) => boolean;
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
    /** A method, or a property typed by a function. */
    readonly callable: boolean;
}

export interface PortDeclaration extends DeclarationName {
    readonly line: number;
    /** Inherited members included. */
    readonly members: readonly PortMember[];
}

export interface PortAdapter extends DeclarationName {
    readonly line: number;
    /** Through the interfaces its implemented or expected interfaces extend, the parts of an intersection, and the ports an interface it meets is handed over as. */
    readonly ports: readonly DeclarationName[];
}

/** Every type a production file expects where it hands over a class, an interface or a named object literal, by that declaration's symbol. */
interface Handovers {
    readonly expected: ReadonlyMap<ts.Symbol, readonly ts.Type[]>;
    /** The variables and functions that name a handed-over object literal. */
    readonly literalOwners: ReadonlySet<ts.Symbol>;
}

const NO_HANDOVERS: Handovers = { expected: new Map(), literalOwners: new Set() };

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
    const adapterFiles = sourceFiles.filter(({ fileName }) => scope.isAdapterFile(fileName));
    const handovers = reader.handoversIn(adapterFiles);
    const adapters = new Map<ts.Symbol, PortAdapter>(
        adapterFiles.flatMap((sourceFile) =>
            reader.adaptersIn(
                sourceFile,
                ports,
                handovers,
                scope.isLiteralAdapterFile(sourceFile.fileName),
            ),
        ),
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
                .map((member) => {
                    const signatures = this.callSignaturesOf(member);
                    return {
                        name: member.name,
                        returnsNothing:
                            signatures.length > 0 &&
                            signatures.every((signature) =>
                                isVoid(this.awaited(signature.getReturnType())),
                            ),
                        callable: signatures.length > 0,
                    };
                });
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

    handoversIn(sourceFiles: readonly ts.SourceFile[]): Handovers {
        const expected = new Map<ts.Symbol, ts.Type[]>();
        const literalOwners = new Set<ts.Symbol>();
        for (const expression of sourceFiles.flatMap(handedOverExpressions)) {
            const expectedType = this.checker.getContextualType(expression);
            const handed = expectedType === undefined ? undefined : this.handedOver(expression);
            if (expectedType === undefined || handed === undefined) {
                continue;
            }
            if (handed.isLiteral) {
                literalOwners.add(handed.symbol);
            }
            const known = expected.get(handed.symbol);
            if (known === undefined) {
                expected.set(handed.symbol, [expectedType]);
            } else {
                known.push(expectedType);
            }
        }
        return { expected, literalOwners };
    }

    adaptersIn(
        sourceFile: ts.SourceFile,
        ports: ReadonlyMap<ts.Symbol, PortDeclaration>,
        handovers: Handovers,
        acceptsLiterals: boolean,
    ): [ts.Symbol, PortAdapter][] {
        return adapterCandidates(sourceFile).flatMap(({ declaration, name, implemented }) => {
            const symbol = this.checker.getSymbolAtLocation(name) as ts.Symbol;
            const isLiteralOwner = acceptsLiterals && handovers.literalOwners.has(symbol);
            if (!ts.isClassLike(declaration) && !isLiteralOwner) {
                return [];
            }
            const reached = this.portsReachedFrom(
                [
                    ...implemented.map((expression) => this.checker.getTypeAtLocation(expression)),
                    ...(handovers.expected.get(symbol) ?? []),
                ],
                ports,
                handovers,
            );
            if (reached.length === 0) {
                return [];
            }
            return [
                [
                    symbol,
                    {
                        fileName: sourceFile.fileName,
                        name: name.text,
                        line: lineOf(sourceFile, declaration),
                        ports: reached.map(nameOf),
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

    private callSignaturesOf(member: ts.Symbol): readonly ts.Signature[] {
        return this.checker
            .getNonNullableType(this.checker.getTypeOfSymbol(member))
            .getCallSignatures();
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
            .flatMap((type) => this.portsReachedFrom([type], ports, NO_HANDOVERS));
    }

    /** A class reached here is not followed further: what a class is handed over as says nothing about the values typed by it. */
    private portsReachedFrom(
        start: readonly ts.Type[],
        ports: ReadonlyMap<ts.Symbol, PortDeclaration>,
        { expected }: Handovers,
    ): PortDeclaration[] {
        const visited = new Set<ts.Symbol>();
        const reached: PortDeclaration[] = [];
        const pending = start.flatMap((type) => this.parts(type));
        for (let type = pending.shift(); type !== undefined; type = pending.shift()) {
            for (const symbol of this.declaredTypes(type)) {
                if (visited.has(symbol)) {
                    continue;
                }
                visited.add(symbol);
                const port = ports.get(symbol);
                if (port !== undefined) {
                    reached.push(port);
                }
                if ((symbol.flags & ts.SymbolFlags.Interface) !== 0) {
                    pending.push(
                        ...(expected.get(symbol) ?? []).flatMap((next) => this.parts(next)),
                    );
                }
            }
        }
        return reached;
    }

    /** A type parameter stands for its constraint, and a union or an intersection for each part. */
    private parts(type: ts.Type): ts.Type[] {
        // A flag test, as the type guard isTypeParameter() narrows every other type to never.
        if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
            const constraint = this.checker.getBaseConstraintOfType(type);
            return constraint === undefined ? [] : this.parts(constraint);
        }
        if (type.isUnionOrIntersection()) {
            return type.types.flatMap((part) => this.parts(part));
        }
        return [type];
    }

    /** What production code hands over, as the declaration whose symbol the expected type is recorded under. */
    private handedOver(
        expression: ts.Expression,
    ): { readonly symbol: ts.Symbol; readonly isLiteral: boolean } | undefined {
        const type = this.checker.getNonNullableType(this.checker.getTypeAtLocation(expression));
        const symbol = (isTypeReference(type) ? type.target : type).getSymbol();
        if (symbol === undefined) {
            return undefined;
        }
        if ((symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) !== 0) {
            return { symbol, isLiteral: false };
        }
        const literal = symbol.declarations?.find(ts.isObjectLiteralExpression);
        const owner = literal === undefined ? undefined : literalOwnerName(literal);
        const ownerSymbol =
            owner === undefined ? undefined : this.checker.getSymbolAtLocation(owner);
        return ownerSymbol === undefined ? undefined : { symbol: ownerSymbol, isLiteral: true };
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

interface AdapterCandidate {
    readonly declaration: ts.ClassLikeDeclaration | ts.VariableDeclaration | ts.FunctionDeclaration;
    readonly name: ts.Identifier;
    readonly implemented: readonly ts.ExpressionWithTypeArguments[];
}

/** Named classes, and the variables and functions that may name an object literal, in source order. */
function adapterCandidates(sourceFile: ts.SourceFile): AdapterCandidate[] {
    const candidates: AdapterCandidate[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isClassLike(node) && node.name !== undefined) {
            candidates.push({
                declaration: node,
                name: node.name,
                implemented: implementedTypes(node),
            });
        } else if (
            (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) &&
            node.name !== undefined &&
            ts.isIdentifier(node.name)
        ) {
            candidates.push({ declaration: node, name: node.name, implemented: [] });
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return candidates;
}

/** Where a value meets a type the code expects: an argument, an assignment, a return value, an initializer, a property, an element or a branch. */
function handedOverExpressions(sourceFile: ts.SourceFile): ts.Expression[] {
    const found: ts.Expression[] = [];
    const visit = (node: ts.Node): void => {
        found.push(...handedOverBy(node));
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
}

function handedOverBy(node: ts.Node): readonly ts.Expression[] {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        return node.arguments ?? [];
    }
    if (ts.isBinaryExpression(node)) {
        return node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? [node.right] : [];
    }
    if (ts.isReturnStatement(node) || ts.isSatisfiesExpression(node)) {
        return node.expression === undefined ? [] : [node.expression];
    }
    if (ts.isArrowFunction(node)) {
        return ts.isBlock(node.body) ? [] : [node.body];
    }
    if (
        ts.isVariableDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isPropertyAssignment(node)
    ) {
        return node.initializer === undefined ? [] : [node.initializer];
    }
    if (ts.isShorthandPropertyAssignment(node)) {
        return [node.name];
    }
    if (ts.isArrayLiteralExpression(node)) {
        return node.elements;
    }
    return ts.isConditionalExpression(node) ? [node.whenTrue, node.whenFalse] : [];
}

/** The variable it initialises, or the named function that returns it; a method or an inline literal has none. */
function literalOwnerName(literal: ts.ObjectLiteralExpression): ts.Identifier | undefined {
    let node: ts.Node = literal;
    while (ts.isParenthesizedExpression(node.parent) || ts.isSatisfiesExpression(node.parent)) {
        node = node.parent;
    }
    const { parent } = node;
    if (ts.isVariableDeclaration(parent)) {
        return variableName(parent);
    }
    if (ts.isArrowFunction(parent)) {
        return functionName(parent);
    }
    return ts.isReturnStatement(parent)
        ? functionName(ts.findAncestor(parent, ts.isFunctionLike))
        : undefined;
}

function functionName(declaration: ts.SignatureDeclaration | undefined): ts.Identifier | undefined {
    if (declaration !== undefined && ts.isFunctionDeclaration(declaration)) {
        return declaration.name;
    }
    return declaration !== undefined && ts.isVariableDeclaration(declaration.parent)
        ? variableName(declaration.parent)
        : undefined;
}

function variableName({ name }: ts.VariableDeclaration): ts.Identifier | undefined {
    return ts.isIdentifier(name) ? name : undefined;
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
