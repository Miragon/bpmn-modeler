/**
 * Value object that maps a Camunda `scriptFormat` string to VS Code language
 * identifiers and file extensions.
 *
 * Known mappings cover the languages this extension provides IntelliSense
 * for via the shared `CompletionItemProvider` (JavaScript, Groovy, Python,
 * Ruby). Unknown formats fall back to `plaintext`, which is intentionally
 * treated as *unsupported* so the open flow can prompt the user to pick a
 * real language instead.
 */
export class ScriptLanguage {
    private static readonly MAPPINGS: ReadonlyMap<
        string,
        { languageId: string; extension: string }
    > = new Map([
        ["javascript", { languageId: "javascript", extension: "js" }],
        ["groovy", { languageId: "groovy", extension: "groovy" }],
        ["python", { languageId: "python", extension: "py" }],
        ["ruby", { languageId: "ruby", extension: "rb" }],
    ]);

    private static readonly FALLBACK = {
        languageId: "plaintext",
        extension: "txt",
    };

    // The VS Code language identifier (e.g. `"javascript"`).
    readonly languageId: string;

    // The file extension without a leading dot (e.g. `"js"`).
    readonly extension: string;

    /**
     * Creates a ScriptLanguage from a Camunda `scriptFormat` value.
     *
     * @param scriptFormat Raw format string from the BPMN model (e.g. `"javascript"`, `"groovy"`).
     */
    constructor(scriptFormat: string) {
        const normalized = ScriptLanguage.normalize(scriptFormat);
        const mapping = ScriptLanguage.MAPPINGS.get(normalized) ?? ScriptLanguage.FALLBACK;
        this.languageId = mapping.languageId;
        this.extension = mapping.extension;
    }

    /**
     * Returns true when `scriptFormat` matches one of the languages this
     * extension provides IntelliSense for. Used by the open flow to decide
     * whether to honour the BPMN model's `camunda:scriptFormat` directly or
     * prompt the user to pick a supported language.
     */
    static isSupported(scriptFormat: string): boolean {
        return ScriptLanguage.MAPPINGS.has(ScriptLanguage.normalize(scriptFormat));
    }

    /**
     * Returns the canonical Camunda format strings we support, in display order.
     */
    static supportedFormats(): readonly string[] {
        return [...ScriptLanguage.MAPPINGS.keys()];
    }

    /**
     * Reverse of the format→extension mapping: resolves a file extension back to
     * its {@link ScriptLanguage}, or `undefined` when no supported language owns
     * it. Doubles as the ambient-file guard during adoption — `camunda.d.ts`
     * (`ts`) and `jsconfig.json` (`json`) are not script languages, so both
     * return `undefined` and are skipped rather than tracked as scripts.
     */
    static fromExtension(extension: string): ScriptLanguage | undefined {
        const normalized = ScriptLanguage.normalize(extension);
        for (const [format, mapping] of ScriptLanguage.MAPPINGS) {
            if (mapping.extension === normalized) {
                return new ScriptLanguage(format);
            }
        }
        return undefined;
    }

    private static normalize(scriptFormat: string): string {
        return scriptFormat.toLowerCase().trim();
    }
}
