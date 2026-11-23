/** A call or `new` whose arguments hold a text: `this.logger.info` calls `info` on `logger`. */
export interface CallSite {
    readonly construct: boolean;
    readonly callee?: string;
    readonly receiver?: string;
    /** Kotlin, which constructs without `new`: the call is what a `throw` raises. */
    readonly thrown?: boolean;
}

export interface EnclosingCalls {
    readonly argumentOf: readonly CallSite[];
    /** Kotlin: the call whose parentheses the nearest lambda around the text follows. */
    readonly trailingLambdaOf?: CallSite;
}

/** A Kotlin `val` or `var`, a constructor property's default included, whose value is a call: `log` from `Logger.getInstance`. */
interface InitializedValue {
    readonly name: string;
    /** The called name with its qualifiers. */
    readonly initializer: string;
}

export interface LoggerDeclarations {
    readonly importedSpecifiers: readonly string[];
    readonly initializedValues: readonly InitializedValue[];
}

interface MessageSource extends LoggerDeclarations {
    readonly kotlin: boolean;
}

// The members of the core's LoggerPort: logInfo, logWarning, logError, logDebug.
const TYPESCRIPT_LOGGING_CALLEE = /^log(?![a-z])/;
const TYPESCRIPT_ERROR = "Error";
const INTELLIJ_DIAGNOSTIC_PACKAGE = "com.intellij.openapi.diagnostic";
// A file imports each by its first name: `Logger` for `Logger.getInstance`.
const INTELLIJ_LOGGER_FACTORIES: readonly string[] = ["Logger.getInstance", "logger", "fileLogger"];
const INTELLIJ_THIS_LOGGER = "thisLogger";
// Kotlin's preconditions throw what their lambda returns, a message for developers.
const KOTLIN_PRECONDITIONS: ReadonlySet<string> = new Set([
    "require",
    "check",
    "requireNotNull",
    "checkNotNull",
]);

export function isTypeScriptLogCall({ construct, callee = "" }: CallSite): boolean {
    return !construct && TYPESCRIPT_LOGGING_CALLEE.test(callee);
}

export function isErrorConstruction({ construct, callee }: CallSite): boolean {
    return construct && callee === TYPESCRIPT_ERROR;
}

function importsFromDiagnostics(importedSpecifiers: readonly string[], name: string): boolean {
    return importedSpecifiers.some(
        (specifier) =>
            specifier === `${INTELLIJ_DIAGNOSTIC_PACKAGE}.${name}` ||
            specifier === `${INTELLIJ_DIAGNOSTIC_PACKAGE}.*`,
    );
}

function isLoggerFactory(initializer: string, importedSpecifiers: readonly string[]): boolean {
    return INTELLIJ_LOGGER_FACTORIES.some(
        (factory) =>
            initializer === `${INTELLIJ_DIAGNOSTIC_PACKAGE}.${factory}` ||
            (initializer === factory &&
                importsFromDiagnostics(importedSpecifiers, factory.split(".")[0])),
    );
}

/** IntelliJ's loggers in a Kotlin file: values it declares from `Logger.getInstance(…)`, `logger<T>()` or `fileLogger()`, and `thisLogger()`. */
export function kotlinLoggers({
    importedSpecifiers,
    initializedValues,
}: LoggerDeclarations): Set<string> {
    const loggers = initializedValues
        .filter(({ initializer }) => isLoggerFactory(initializer, importedSpecifiers))
        .map(({ name }) => name);
    if (importsFromDiagnostics(importedSpecifiers, INTELLIJ_THIS_LOGGER)) {
        loggers.push(INTELLIJ_THIS_LOGGER);
    }
    return new Set(loggers);
}

function isTypeScriptDeveloperCall(site: CallSite): boolean {
    return isErrorConstruction(site) || isTypeScriptLogCall(site);
}

function isPreconditionMessage(lambdaOf: CallSite | undefined): boolean {
    return lambdaOf?.receiver === undefined && KOTLIN_PRECONDITIONS.has(lambdaOf?.callee ?? "");
}

function kotlinDeveloperMessageRule(
    declarations: LoggerDeclarations,
): (calls: EnclosingCalls) => boolean {
    const loggers = kotlinLoggers(declarations);
    const isUnreadArgument = (site: CallSite): boolean =>
        site.thrown === true || loggers.has(site.receiver ?? "");
    return ({ argumentOf, trailingLambdaOf }) =>
        argumentOf.some(isUnreadArgument) || isPreconditionMessage(trailingLambdaOf);
}

// A log line and an error's message are read by developers; the core does not word them.
export function developerMessageRule(source: MessageSource): (calls: EnclosingCalls) => boolean {
    if (!source.kotlin) {
        return ({ argumentOf }) => argumentOf.some(isTypeScriptDeveloperCall);
    }
    return kotlinDeveloperMessageRule(source);
}
