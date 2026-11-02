const path = require("node:path");
const ts = require("typescript");

const EQUALITY_OPERATORS = new Set(["===", "!==", "==", "!="]);
const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

const guardedValuesByProgram = new WeakMap();

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Compare a guarded domain value with a string literal only in the module that owns its rules.",
        },
        messages: {
            comparedOutsideHome: "{{message}}",
        },
        schema: [
            {
                type: "object",
                properties: {
                    guardedTypes: {
                        type: "array",
                        minItems: 1,
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                module: { type: "string" },
                                homes: { type: "array", items: { type: "string" } },
                                message: { type: "string" },
                            },
                            required: ["name", "module", "homes", "message"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["guardedTypes"],
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const { guardedTypes } = context.options[0];
        const parserServices = context.sourceCode.parserServices;
        const program = parserServices?.program;
        if (!program) {
            throw new Error(
                `no-guarded-value-comparison needs type information, and ${context.filename} has none.`,
            );
        }
        const filename = path.normalize(context.filename);
        const guarded = guardedValuesOf(program, guardedTypes).filter(
            ({ entry }) => !entry.homes.some((home) => path.normalize(home) === filename),
        );
        if (guarded.length === 0) {
            return {};
        }
        const checker = program.getTypeChecker();

        const guardedEntryOf = (expression) => {
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(expression);
            const literals = stringLiteralsOf(checker, checker.getTypeAtLocation(tsNode));
            if (literals === undefined) {
                return undefined;
            }
            return guarded.find(({ values }) => literals.every((literal) => values.has(literal)))
                ?.entry;
        };

        const reportIfGuarded = (node, comparedExpression) => {
            const entry = guardedEntryOf(comparedExpression);
            if (entry) {
                context.report({
                    node,
                    messageId: "comparedOutsideHome",
                    data: { message: entry.message },
                });
            }
        };

        return {
            BinaryExpression(node) {
                if (!EQUALITY_OPERATORS.has(node.operator)) {
                    return;
                }
                if (isStringLiteral(node.right)) {
                    reportIfGuarded(node, node.left);
                } else if (isStringLiteral(node.left)) {
                    reportIfGuarded(node, node.right);
                }
            },
            SwitchStatement(node) {
                const entry = guardedEntryOf(node.discriminant);
                if (!entry) {
                    return;
                }
                for (const switchCase of node.cases) {
                    if (switchCase.test && isStringLiteral(switchCase.test)) {
                        context.report({
                            node: switchCase,
                            messageId: "comparedOutsideHome",
                            data: { message: entry.message },
                        });
                    }
                }
            },
        };
    },
};

function isStringLiteral(node) {
    return (
        (node.type === "Literal" && typeof node.value === "string") ||
        (node.type === "TemplateLiteral" && node.expressions.length === 0)
    );
}

/** `undefined` unless the type, nullish parts removed, holds only string literals. */
function stringLiteralsOf(checker, type) {
    const resolved =
        type.flags & ts.TypeFlags.TypeParameter ? checker.getBaseConstraintOfType(type) : type;
    if (!resolved) {
        return undefined;
    }
    const parts = (resolved.isUnion() ? resolved.types : [resolved]).filter(
        (part) => !(part.flags & NULLISH),
    );
    if (parts.length === 0 || !parts.every((part) => part.isStringLiteral())) {
        return undefined;
    }
    return parts.map((part) => part.value);
}

// The registry is read against the code on every run, so a renamed or widened type fails the lint.
function guardedValuesOf(program, guardedTypes) {
    let resolved = guardedValuesByProgram.get(program);
    if (!resolved) {
        resolved = new Map();
        guardedValuesByProgram.set(program, resolved);
    }
    return guardedTypes.map((entry) => {
        const key = `${entry.module}\0${entry.name}`;
        if (!resolved.has(key)) {
            resolved.set(key, resolveGuardedValues(program, entry));
        }
        return { entry, values: resolved.get(key) };
    });
}

function resolveGuardedValues(program, { name, module }) {
    const sourceFile = program.getSourceFile(module);
    if (!sourceFile) {
        throw new Error(`Guarded type ${name}: ${module} is not in the TypeScript program.`);
    }
    const checker = program.getTypeChecker();
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    const exported = moduleSymbol
        ? checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === name)
        : undefined;
    if (!exported) {
        throw new Error(`Guarded type ${name}: ${module} exports no ${name}.`);
    }
    const declared =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const literals = stringLiteralsOf(checker, checker.getDeclaredTypeOfSymbol(declared));
    if (!literals) {
        throw new Error(`Guarded type ${name}: ${name} is not a union of string literals.`);
    }
    return new Set(literals);
}
