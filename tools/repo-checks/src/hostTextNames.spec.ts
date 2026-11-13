import { requireMatches } from "@miragon/architecture-testing";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { EngineHostTextSources } from "./hostText/adapter/out/engineHostTextSources";
import {
    type CallSite,
    type HostFileTexts,
    isErrorConstruction,
    isHostFile,
    isKotlinSource,
    isTypeScriptLogCall,
    kotlinLoggers,
} from "./hostText/domain/hostText";

/**
 * host-text leaves unread the arguments of TypeScript calls to a function
 * named log… (the members of the core's LoggerPort) and of new Error(…).
 * Each case fails when its name no longer takes any text in host code; it
 * does not tell which functions the name still covers. Kotlin's loggers are
 * derived from their declarations, so their case guards the reader.
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

function typeScriptTextsIn(isUnreadCall: (site: CallSite) => boolean) {
    return hostFiles
        .filter(({ path }) => !isKotlinSource(path))
        .flatMap(({ texts }) => texts)
        .filter(({ argumentOf }) => argumentOf.some(isUnreadCall));
}

describe("the names host-text reads", () => {
    it.each([
        { name: "TypeScript log… calls", isUnreadCall: isTypeScriptLogCall },
        { name: "TypeScript new Error(…)", isUnreadCall: isErrorConstruction },
    ])("$name still take a text in host code", ({ name, isUnreadCall }) => {
        expect(() =>
            requireMatches(`${name} with a text`, typeScriptTextsIn(isUnreadCall)),
        ).not.toThrow();
    });

    it("Kotlin host code declares an IntelliJ logger", () => {
        const loggers = hostFiles
            .filter(({ path }) => isKotlinSource(path))
            .flatMap((file) => [...kotlinLoggers(file)]);

        expect(() => requireMatches("IntelliJ loggers in Kotlin host code", loggers)).not.toThrow();
    });
});
