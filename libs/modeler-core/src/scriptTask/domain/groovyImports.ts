/**
 * Placement logic for auto-inserted Groovy import statements, feeding the
 * completion provider's `additionalTextEdits` for SPIN symbols.
 *
 * Camunda's `SpinScriptEnv` prepends the SPIN static import at runtime, so a
 * script *runs* without one — but the source is then not self-contained and
 * external Groovy tooling cannot resolve the symbol. Completion therefore
 * offers the import, and this helper decides whether it is already satisfied
 * and, if not, on which line it belongs.
 *
 * Line-based like {@link collectLocalDeclarations}: an import statement inside
 * a block comment or multiline string can false-positive as satisfied
 * (accepted — the cost is a missing import the author can add by hand).
 */

// Trailing `;`, leading/trailing space, and internal whitespace runs are all
// legal Groovy variance of the same import — normalize before comparing.
function normalize(line: string): string {
    return line.trim().replace(/;$/, "").trimEnd().replace(/\s+/g, " ");
}

/**
 * The wildcard form that also satisfies the import: the last dotted segment
 * (the imported symbol) replaced by `*` — `import static org.camunda.spin.Spin.S`
 * is covered by `import static org.camunda.spin.Spin.*`.
 */
function wildcardForm(normalizedImport: string): string {
    return normalizedImport.replace(/\.[A-Za-z_$][\w$]*$/, ".*");
}

/**
 * Returns the 0-based line at which `importStatement` should be inserted into
 * `scriptText`, or `undefined` when the script already satisfies it (exact
 * normalized match or a covering wildcard import). New imports go directly
 * below the last existing import so a growing import block stays contiguous;
 * a script without imports gets it on line 0.
 */
export function groovyImportInsertionLine(
    scriptText: string,
    importStatement: string,
): number | undefined {
    const wanted = normalize(importStatement);
    const wildcard = wildcardForm(wanted);

    let lastImportLine = -1;
    const lines = scriptText.split(/\r?\n/);
    for (let line = 0; line < lines.length; line++) {
        if (!/^\s*import\b/.test(lines[line])) {
            continue;
        }
        const found = normalize(lines[line]);
        if (found === wanted || found === wildcard) {
            return undefined;
        }
        lastImportLine = line;
    }
    return lastImportLine + 1;
}
