import * as ts from "typescript";

export interface BaseClass {
    readonly fileName: string;
    readonly className: string;
}

export interface SubclassConstruction {
    readonly fileName: string;
    readonly line: number;
    /** The literal type of the discriminant property, `undefined` when it is not a string literal. */
    readonly discriminant: string | undefined;
}

export function findSubclassConstructions(
    program: ts.Program,
    baseClass: BaseClass,
    discriminantProperty: string,
    isScanned: (fileName: string) => boolean,
): SubclassConstruction[] {
    const checker = program.getTypeChecker();
    const derivesFromBase = derivesFrom(checker, baseClassSymbol(program, checker, baseClass));

    return program
        .getSourceFiles()
        .filter(({ fileName }) => isScanned(fileName))
        .flatMap((sourceFile) =>
            newExpressionsIn(sourceFile)
                .map((expression) => ({ expression, type: checker.getTypeAtLocation(expression) }))
                .filter(({ type }) => derivesFromBase(type))
                .map(({ expression, type }) => ({
                    fileName: sourceFile.fileName,
                    line:
                        sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile))
                            .line + 1,
                    discriminant: literalPropertyType(
                        checker,
                        type,
                        discriminantProperty,
                        expression,
                    ),
                })),
        );
}

/** Whether a scanned file constructs the class or a subclass; a program without the class's file cannot. */
export function constructsClass(
    program: ts.Program,
    constructedClass: BaseClass,
    isScanned: (fileName: string) => boolean,
): boolean {
    if (program.getSourceFile(constructedClass.fileName) === undefined) {
        return false;
    }
    const checker = program.getTypeChecker();
    const classSymbol = baseClassSymbol(program, checker, constructedClass);
    const derivesFromClass = derivesFrom(checker, classSymbol);
    const isClassOrSubclass = (type: ts.Type): boolean =>
        classOf(type).symbol === classSymbol || derivesFromClass(type);
    return program
        .getSourceFiles()
        .filter(({ fileName }) => isScanned(fileName))
        .some((sourceFile) =>
            newExpressionsIn(sourceFile).some((expression) =>
                isClassOrSubclass(checker.getTypeAtLocation(expression)),
            ),
        );
}

function derivesFrom(checker: ts.TypeChecker, baseSymbol: ts.Symbol): (type: ts.Type) => boolean {
    const derives = (type: ts.Type): boolean =>
        baseTypesOf(checker, type).some(
            (base) => classOf(base).symbol === baseSymbol || derives(base),
        );
    return derives;
}

function baseClassSymbol(
    program: ts.Program,
    checker: ts.TypeChecker,
    { fileName, className }: BaseClass,
): ts.Symbol {
    const declaration = program
        .getSourceFile(fileName)
        ?.statements.find(
            (statement): statement is ts.ClassDeclaration & { name: ts.Identifier } =>
                ts.isClassDeclaration(statement) && statement.name?.text === className,
        );
    const symbol = declaration && checker.getSymbolAtLocation(declaration.name);
    if (symbol === undefined) {
        // A moved or renamed base would otherwise match nothing and pass.
        throw new Error(`${className} is not declared in ${fileName}`);
    }
    return symbol;
}

function classOf(type: ts.Type): ts.Type {
    return isTypeReference(type) ? type.target : type;
}

function baseTypesOf(checker: ts.TypeChecker, type: ts.Type): ts.BaseType[] {
    const target = classOf(type);
    return isObjectType(target) && (target.objectFlags & ts.ObjectFlags.Class) !== 0
        ? checker.getBaseTypes(target as ts.InterfaceType)
        : [];
}

function isObjectType(type: ts.Type): type is ts.ObjectType {
    return (type.flags & ts.TypeFlags.Object) !== 0;
}

function isTypeReference(type: ts.Type): type is ts.TypeReference {
    return isObjectType(type) && (type.objectFlags & ts.ObjectFlags.Reference) !== 0;
}

function literalPropertyType(
    checker: ts.TypeChecker,
    type: ts.Type,
    propertyName: string,
    location: ts.Node,
): string | undefined {
    const property = type.getProperty(propertyName);
    const propertyType = property && checker.getTypeOfSymbolAtLocation(property, location);
    return propertyType?.isStringLiteral() ? propertyType.value : undefined;
}

function newExpressionsIn(sourceFile: ts.SourceFile): ts.NewExpression[] {
    const expressions: ts.NewExpression[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isNewExpression(node)) {
            expressions.push(node);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return expressions;
}
