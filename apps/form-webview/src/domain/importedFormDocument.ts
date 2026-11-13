/**
 * A host document the page imported. form-js normalizes a schema on import, so
 * the page answers with the host's own text until an edit changes the schema.
 */
export class ImportedFormDocument {
    constructor(
        private readonly sourceContent: string,
        private readonly serializedBaseline: string,
    ) {}

    contentFor(serializedSchema: string): string {
        return serializedSchema === this.serializedBaseline ? this.sourceContent : serializedSchema;
    }
}
