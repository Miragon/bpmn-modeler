import * as ts from "typescript";

/**
 * Replaces every comment with a space. The parser supplies the token
 * boundaries, so a `//` inside a string, template, regular expression or JSX
 * text stays code.
 */
export function stripComments(fileName: string, text: string): string {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest);
    // Pre-order visits trivia in source order; a parent shares its first child's pos.
    const comments = new Map<number, number>();
    const visit = (node: ts.Node): void => {
        for (const { pos, end } of [
            ...(ts.getTrailingCommentRanges(text, node.pos) ?? []),
            ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
        ]) {
            comments.set(pos, end);
        }
        node.getChildren(sourceFile).forEach(visit);
    };
    visit(sourceFile);
    let stripped = "";
    let cursor = 0;
    for (const [pos, end] of comments) {
        stripped += `${text.slice(cursor, pos)} `;
        cursor = end;
    }
    return stripped + text.slice(cursor);
}
