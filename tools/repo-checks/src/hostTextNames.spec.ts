import { requireMatches } from "@miragon/architecture-testing";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { EngineHostTextSources } from "./hostText/adapter/out/engineHostTextSources";
import {
    type HostFileTexts,
    isHostFile,
    isKotlinSource,
    isTypeScriptLogCall,
    kotlinLoggers,
} from "./hostText/domain/hostText";

/**
 * host-text leaves the arguments of TypeScript calls to a function named
 * log… unread: the members of the core's LoggerPort. A rename would let every
 * log line in host code be reported without a sign, so the name must still
 * match a text there. Kotlin's loggers are derived from their declarations.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));

const sources = new EngineHostTextSources();
const hostFiles: HostFileTexts[] = sources
    .readDependencies(REPO_ROOT)
    .filter(isHostFile)
    .map(({ path, importedSpecifiers }) => ({
        path,
        importedSpecifiers,
        ...sources.readSource(REPO_ROOT, path),
    }));

describe("the names host-text reads", () => {
    it("a TypeScript function named log… still takes a text in host code", () => {
        const logCalls = hostFiles
            .filter(({ path }) => !isKotlinSource(path))
            .flatMap(({ texts }) => texts)
            .filter(({ argumentOf }) => argumentOf.some(isTypeScriptLogCall));

        expect(() => requireMatches("TypeScript log… calls with a text", logCalls)).not.toThrow();
    });

    it("Kotlin host code declares an IntelliJ logger", () => {
        const loggers = hostFiles
            .filter(({ path }) => isKotlinSource(path))
            .flatMap((file) => [...kotlinLoggers(file)]);

        expect(() => requireMatches("IntelliJ loggers in Kotlin host code", loggers)).not.toThrow();
    });
});
