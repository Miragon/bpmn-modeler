import { compareText } from "./compareText";
import { resolveRelativeImport } from "./importGraph";
import { type ModuleSymbols, readModuleSymbols } from "./moduleSymbols";
import { type PathAlias, resolveAliasImport } from "./pathAliases";
import type { SourceFile } from "./sourceTree";

export interface DeclarationEdge {
    readonly from: string;
    readonly to: string;
}

export interface DeclarationGraphOptions {
    readonly aliases?: readonly PathAlias[];
    /** Files an import reaches without exports to follow, such as JSON. */
    readonly dataFiles?: readonly string[];
}

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;

/**
 * Links each importer to the module it imports and to the files that declare
 * what it imports, through barrels and aliases. A barrel never stands in for
 * the declaring file, so it gets no edge of its own. Sorted, one per pair.
 */
export function buildDeclarationGraph(
    tree: readonly SourceFile[],
    options: DeclarationGraphOptions = {},
): DeclarationEdge[] {
    const declarations = DeclarationFinder.of(tree, options);
    const edges = [...declarations.symbolsByFile].flatMap(([from, symbols]) =>
        [...declarations.reachedBy(from, symbols)]
            .filter((to) => to !== from)
            .map((to) => ({ from, to })),
    );
    return edges.sort(
        (left, right) => compareText(left.from, right.from) || compareText(left.to, right.to),
    );
}

export class DeclarationFinder {
    private constructor(
        readonly symbolsByFile: ReadonlyMap<string, ModuleSymbols>,
        private readonly resolve: (fromFile: string, specifier: string) => string | undefined,
    ) {}

    static of(
        tree: readonly SourceFile[],
        { aliases = [], dataFiles = [] }: DeclarationGraphOptions,
    ): DeclarationFinder {
        const symbolsByFile = new Map(
            tree
                .filter(({ path }) => SCRIPT_FILE.test(path))
                .map(({ path, text }) => [path, readModuleSymbols(path, text)]),
        );
        const known = new Set([...tree.map(({ path }) => path), ...dataFiles]);
        return new DeclarationFinder(symbolsByFile, (fromFile, specifier) =>
            specifier.startsWith(".")
                ? resolveRelativeImport(fromFile, specifier, known)
                : resolveAliasImport(specifier, aliases, known),
        );
    }

    /** The files declaring `name` as `fromFile` imports it from `specifier`; none when the module does not resolve. */
    declaringFiles(fromFile: string, specifier: string, name: string): string[] {
        const module = this.resolve(fromFile, specifier);
        return module === undefined ? [] : this.declarationOrModule(module, name);
    }

    reachedBy(from: string, symbols: ModuleSymbols): Set<string> {
        const reached = new Set<string>();
        const link = (specifier: string, names: readonly string[] | undefined): void => {
            const module = this.resolve(from, specifier);
            if (module === undefined) {
                return;
            }
            if (this.symbolsByFile.get(module)?.declaresNothing === false) {
                reached.add(module);
            }
            const targets =
                names === undefined
                    ? this.everyDeclaration(module)
                    : names.flatMap((name) => this.declarationOrModule(module, name));
            targets.forEach((target) => reached.add(target));
        };
        symbols.imports.forEach(({ specifier, names }) => link(specifier, names));
        symbols.reExports.forEach(({ specifier, imported }) =>
            link(specifier, imported === undefined ? undefined : [imported]),
        );
        symbols.starReExports.forEach((specifier) => link(specifier, undefined));
        return reached;
    }

    private declarationOrModule(module: string, name: string): string[] {
        return this.declarationsOf(module, name, new Set()) ?? [module];
    }

    private declarationsOf(
        module: string,
        name: string,
        visited: Set<string>,
    ): string[] | undefined {
        const visit = `${module}#${name}`;
        if (visited.has(visit)) {
            return undefined;
        }
        visited.add(visit);
        const symbols = this.symbolsByFile.get(module);
        if (symbols === undefined || symbols.declaredExports.includes(name)) {
            return [module];
        }
        const reExport = symbols.reExports.find(({ exported }) => exported === name);
        if (reExport !== undefined) {
            const target = this.resolve(module, reExport.specifier);
            if (target === undefined) {
                return undefined;
            }
            return reExport.imported === undefined
                ? this.everyDeclaration(target)
                : this.declarationsOf(target, reExport.imported, visited);
        }
        if (name === "default") {
            return undefined;
        }
        const found = symbols.starReExports.flatMap((specifier) => {
            const target = this.resolve(module, specifier);
            return target === undefined ? [] : (this.declarationsOf(target, name, visited) ?? []);
        });
        return found.length === 0 ? undefined : found;
    }

    /** The module itself unless it is a barrel, and everything its re-exports reach. */
    private everyDeclaration(module: string): string[] {
        const reached = this.reachedThroughExports(module, new Set());
        return reached.length === 0 ? [module] : [...new Set(reached)];
    }

    private reachedThroughExports(module: string, visited: Set<string>): string[] {
        if (visited.has(module)) {
            return [];
        }
        visited.add(module);
        const symbols = this.symbolsByFile.get(module);
        if (symbols === undefined) {
            return [module];
        }
        const resolved = (specifier: string): string[] => {
            const target = this.resolve(module, specifier);
            return target === undefined ? [] : [target];
        };
        return [
            ...(symbols.declaresNothing ? [] : [module]),
            ...symbols.reExports.flatMap(({ specifier, imported }) =>
                resolved(specifier).flatMap((target) =>
                    imported === undefined
                        ? this.reachedThroughExports(target, visited)
                        : this.declarationOrModule(target, imported),
                ),
            ),
            ...symbols.starReExports.flatMap((specifier) =>
                resolved(specifier).flatMap((target) =>
                    this.reachedThroughExports(target, visited),
                ),
            ),
        ];
    }
}
