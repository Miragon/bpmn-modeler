import { extname } from "node:path";
import * as ts from "typescript";

// Rules re-read the same sources, often under other names, and the parse is
// the slow part of a rule. The extension stays in the key: `.tsx` reads JSX.
const treesByExtension = new Map<string, Map<string, ts.SourceFile>>();

export function parseSource(fileName: string, text: string): ts.SourceFile {
    const extension = extname(fileName);
    let trees = treesByExtension.get(extension);
    if (trees === undefined) {
        trees = new Map();
        treesByExtension.set(extension, trees);
    }
    let tree = trees.get(text);
    if (tree === undefined) {
        tree = ts.createSourceFile(fileName, text, {
            languageVersion: ts.ScriptTarget.Latest,
            // No reader looks inside JSDoc.
            jsDocParsingMode: ts.JSDocParsingMode.ParseNone,
        });
        trees.set(text, tree);
    }
    return tree;
}
