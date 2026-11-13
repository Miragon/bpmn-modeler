import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { constructsClass, findSubclassConstructions } from "./subclassConstructions";

const MESSAGES = "/repo/libs/shared/messages.ts";
const MAIN = "/repo/apps/x-webview/src/main.ts";
const VENDOR = "/repo/node_modules/vendor/index.ts";

const messages = `
export abstract class Command<TType extends string = string> {
    public readonly type: TType;
    protected constructor(type: TType) { this.type = type; }
}
export class PingCommand extends Command<"PingCommand"> {
    constructor() { super("PingCommand"); }
}
export abstract class LogMessageCommand<TType extends string = string> extends Command<TType> {
    protected constructor(type: TType) { super(type); }
}
export class LogErrorCommand extends LogMessageCommand<"LogErrorCommand"> {
    constructor() { super("LogErrorCommand"); }
}
export class Heartbeat extends Command<"Heartbeat"> {
    constructor() { super("Heartbeat"); }
}
export class LooseCommand extends Command<string> {
    constructor(type: string) { super(type); }
}
export class FooCommand {
    public readonly type = "FooCommand";
}
export class Unconstructed {}
`;

// Interpolated, so the trigger-path check does not read the fixture imports as the spec's own.
const fromMain = "../../../libs/shared/messages";
const fromVendor = "../../libs/shared/messages";

const main = `import { FooCommand, Heartbeat, LogErrorCommand, LooseCommand, PingCommand } from "${fromMain}";

export const posted = [
    new PingCommand(),
    new LogErrorCommand(),
    new Heartbeat(),
    new FooCommand(),
    new LooseCommand("Loose"),
    new Factory(),
    new Unresolved(),
];

declare const Factory: new () => { readonly type: "Factory" };
`;

const vendor = `import { PingCommand } from "${fromVendor}";
export const vendored = new PingCommand();
`;

function programOf(files: Readonly<Record<string, string>>): ts.Program {
    const options: ts.CompilerOptions = {
        noLib: true,
        noEmit: true,
        strict: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
    };
    const host: ts.CompilerHost = {
        ...ts.createCompilerHost(options),
        fileExists: (fileName) => fileName in files,
        directoryExists: (dir) =>
            Object.keys(files).some((fileName) => fileName.startsWith(`${dir}/`)),
        realpath: (path) => path,
        readFile: (fileName) => files[fileName],
        getSourceFile: (fileName, languageVersion) =>
            fileName in files
                ? ts.createSourceFile(fileName, files[fileName], languageVersion)
                : undefined,
    };
    return ts.createProgram({ rootNames: Object.keys(files), options, host });
}

const program = programOf({ [MESSAGES]: messages, [MAIN]: main, [VENDOR]: vendor });
const outsideNodeModules = (fileName: string): boolean => !fileName.includes("/node_modules/");

describe("findSubclassConstructions", () => {
    const constructions = findSubclassConstructions(
        program,
        { fileName: MESSAGES, className: "Command" },
        "type",
        outsideNodeModules,
    );

    it("finds a direct subclass with its file, line and literal discriminant", () => {
        expect(constructions).toContainEqual({
            fileName: MAIN,
            line: 4,
            discriminant: "PingCommand",
        });
    });

    it("finds a subclass through an abstract intermediate class", () => {
        expect(constructions).toContainEqual({
            fileName: MAIN,
            line: 5,
            discriminant: "LogErrorCommand",
        });
    });

    it("finds a subclass whatever its name", () => {
        expect(constructions).toContainEqual({
            fileName: MAIN,
            line: 6,
            discriminant: "Heartbeat",
        });
    });

    it("leaves out a class that only carries the name and does not extend the base", () => {
        expect(constructions.map(({ line }) => line)).not.toContain(7);
    });

    it.each([
        { case: "a constructor that is not a class", line: 9 },
        { case: "a constructor that does not resolve", line: 10 },
    ])("leaves out $case", ({ line }) => {
        expect(constructions.map((construction) => construction.line)).not.toContain(line);
    });

    it("reports a discriminant that is not a literal as undefined", () => {
        expect(constructions).toContainEqual({ fileName: MAIN, line: 8, discriminant: undefined });
    });

    it("skips a file it is told not to scan", () => {
        expect(constructions.map(({ fileName }) => fileName)).not.toContain(VENDOR);
    });

    it("finds nothing else", () => {
        expect(constructions).toHaveLength(4);
    });

    it.each([
        { case: "a file outside the program", fileName: "/repo/libs/shared/moved.ts" },
        { case: "a class the file does not declare", fileName: MESSAGES, className: "Message" },
    ])("throws when the base class is $case", ({ fileName, className = "Command" }) => {
        expect(() =>
            findSubclassConstructions(program, { fileName, className }, "type", outsideNodeModules),
        ).toThrow(`${className} is not declared in ${fileName}`);
    });
});

describe("constructsClass", () => {
    it.each([
        { case: "the class itself", className: "PingCommand", isScanned: outsideNodeModules },
        { case: "a subclass", className: "LogMessageCommand", isScanned: outsideNodeModules },
        {
            case: "the class in a scanned file only",
            className: "PingCommand",
            isScanned: (fileName: string) => fileName === VENDOR,
        },
    ])("is true when a scanned file constructs $case", ({ className, isScanned }) => {
        expect(constructsClass(program, { fileName: MESSAGES, className }, isScanned)).toBe(true);
    });

    it.each([
        {
            case: "no file constructs the class",
            className: "Unconstructed",
            isScanned: outsideNodeModules,
        },
        {
            case: "only a file it is told not to scan constructs it",
            className: "Heartbeat",
            isScanned: (fileName: string) => fileName === VENDOR,
        },
    ])("is false when $case", ({ className, isScanned }) => {
        expect(constructsClass(program, { fileName: MESSAGES, className }, isScanned)).toBe(false);
    });

    it("is false for a program without the class's file, which cannot construct it", () => {
        expect(
            constructsClass(
                programOf({ [VENDOR]: "export const vendored = 1;" }),
                { fileName: MESSAGES, className: "PingCommand" },
                outsideNodeModules,
            ),
        ).toBe(false);
    });

    it("throws when the class's file declares no such class", () => {
        expect(() =>
            constructsClass(
                program,
                { fileName: MESSAGES, className: "Message" },
                outsideNodeModules,
            ),
        ).toThrow(`Message is not declared in ${MESSAGES}`);
    });
});
