/**
 * Fluent builder for assembling multipart/form-data request bodies.
 *
 * Generates a unique boundary, accumulates text fields and file parts,
 * and produces the final `Buffer` ready for HTTP transport.
 */
export class MultipartBuilder {
    private readonly parts: Buffer[] = [];

    /** The boundary string used to separate parts. */
    readonly boundary: string;

    constructor() {
        this.boundary = `----BpmnDeployBoundary${Date.now()}`;
    }

    /**
     * Appends a plain-text form field.
     *
     * @param name The form field name.
     * @param value The field value.
     * @returns `this` for chaining.
     */
    addField(name: string, value: string): this {
        this.parts.push(
            Buffer.from(
                `--${this.boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
            ),
        );
        return this;
    }

    /**
     * Appends a file part with `application/octet-stream` content type.
     *
     * @param partName The form field name for the file part.
     * @param filename The filename included in the `Content-Disposition` header.
     * @param content The UTF-8 file content.
     * @returns `this` for chaining.
     */
    addFile(partName: string, filename: string, content: string): this {
        this.parts.push(
            Buffer.from(
                `--${this.boundary}\r\nContent-Disposition: form-data; name="${partName}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
            ),
            Buffer.from(content, "utf-8"),
            Buffer.from("\r\n"),
        );
        return this;
    }

    /**
     * Finalises the multipart body by appending the closing boundary.
     *
     * @returns An object containing the assembled `body` buffer and the `boundary` string.
     */
    build(): { body: Buffer; boundary: string } {
        const closing = Buffer.from(`--${this.boundary}--\r\n`);
        return {
            body: Buffer.concat([...this.parts, closing]),
            boundary: this.boundary,
        };
    }
}
