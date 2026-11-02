import * as ts from "typescript";

import { parseSource } from "./parseSource";

/**
 * Replaces every comment with a space. The parser supplies the token
 * boundaries, so a `//` inside a string, template, regular expression or JSX
 * text stays code.
 */
export function stripComments(fileName: string, text: string): string {
    let stripped = "";
    let cursor = 0;
    for (const { pos, end } of commentRanges(parseSource(fileName, text))) {
        stripped += `${text.slice(cursor, pos)} `;
        cursor = end;
    }
    return stripped + text.slice(cursor);
}

/**
 * Every literal and JSX text is a leaf of the tree, so the text between a
 * node's children holds only trivia and punctuation, which the scanner reads
 * without context. A leaf adds only the trivia in front of its token.
 */
function commentRanges(sourceFile: ts.SourceFile): ts.TextRange[] {
    const { text } = sourceFile;
    const skipTrivia = false;
    const scanner = ts.createScanner(
        ts.ScriptTarget.Latest,
        skipTrivia,
        sourceFile.languageVariant,
        text,
    );
    const ranges: ts.TextRange[] = [];
    const scan = (start: number, end: number, untilFirstToken: boolean): void => {
        // Most ranges hold no comment; scanning only the rest keeps the walk cheap.
        if (!text.slice(start, end).includes("/")) {
            return;
        }
        scanner.resetTokenState(start);
        while (scanner.getTokenEnd() < end) {
            const kind = scanner.scan();
            if (
                kind === ts.SyntaxKind.SingleLineCommentTrivia ||
                kind === ts.SyntaxKind.MultiLineCommentTrivia
            ) {
                ranges.push({ pos: scanner.getTokenStart(), end: scanner.getTokenEnd() });
            } else if (untilFirstToken && !isTrivia(kind)) {
                return;
            }
        }
    };
    const visit = (node: ts.Node): void => {
        if (ts.isToken(node)) {
            if (!ts.isJsxText(node)) {
                scan(node.pos, node.end, true);
            }
            return;
        }
        let gapStart = node.pos;
        ts.forEachChild(node, (child) => {
            scan(gapStart, child.pos, false);
            visit(child);
            gapStart = child.end;
        });
        scan(gapStart, node.end, false);
    };
    visit(sourceFile);
    return ranges;
}

function isTrivia(kind: ts.SyntaxKind): boolean {
    return kind >= ts.SyntaxKind.FirstTriviaToken && kind <= ts.SyntaxKind.LastTriviaToken;
}
