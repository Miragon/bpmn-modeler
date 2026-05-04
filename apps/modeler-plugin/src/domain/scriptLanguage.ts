/**
 * Value object that maps a Camunda `scriptFormat` string to VS Code language
 * identifiers and file extensions.
 *
 * Known mappings cover the languages this extension provides IntelliSense
 * for (TypeScript ambient stubs for JavaScript; a `CompletionItemProvider`
 * for Groovy / Python / Ruby). Unknown formats fall back to `plaintext`,
 * which is intentionally treated as *unsupported* so the open flow can
 * prompt the user to pick a real language instead.
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

    /** The VS Code language identifier (e.g. `"javascript"`). */
    readonly languageId: string;

    /** The file extension without a leading dot (e.g. `"js"`). */
    readonly extension: string;

    /**
     * Creates a ScriptLanguage from a Camunda `scriptFormat` value.
     *
     * @param scriptFormat Raw format string from the BPMN model (e.g. `"javascript"`, `"groovy"`).
     */
    constructor(scriptFormat: string) {
        const normalized = ScriptLanguage.normalize(scriptFormat);
        const mapping =
            ScriptLanguage.MAPPINGS.get(normalized) ?? ScriptLanguage.FALLBACK;
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
        return ScriptLanguage.MAPPINGS.has(
            ScriptLanguage.normalize(scriptFormat),
        );
    }

    /** Returns the canonical Camunda format strings we support, in display order. */
    static supportedFormats(): readonly string[] {
        return [...ScriptLanguage.MAPPINGS.keys()];
    }

    private static normalize(scriptFormat: string): string {
        return scriptFormat.toLowerCase().trim();
    }
}
