import {
    Diagnostic,
    DiagnosticCollection,
    DiagnosticSeverity,
    languages,
    Position,
    Range,
    Uri,
} from "vscode";

import { LintResults } from "@miragon/bpmn-modeler-shared";
import { DiagnosticsPort } from "@miragon/bpmn-modeler-core";

/**
 * Publishes bpmnlint findings into VS Code's Problems panel via a single shared
 * {@link DiagnosticCollection}, so lint results are searchable and clickable
 * without opening the diagram — the payoff of linting in the host (issue #1304).
 *
 * bpmnlint reports address elements by id, not text ranges, so the range is a
 * best-effort scan for the element's `id="…"` in the XML, falling back to the
 * document start. That is enough for the Problems entry to open the file; the
 * precise on-canvas location is still shown by the in-diagram overlay.
 */
export class VsCodeDiagnostics implements DiagnosticsPort {
    private readonly collection: DiagnosticCollection =
        languages.createDiagnosticCollection("bpmnlint");

    publish(documentUri: string, xml: string, results: LintResults): void {
        const uri = Uri.parse(documentUri);
        const diagnostics: Diagnostic[] = [];

        for (const reports of Object.values(results)) {
            for (const report of reports) {
                const range = this.rangeForElement(xml, report.id);
                const diagnostic = new Diagnostic(
                    range,
                    report.message,
                    this.severity(report.category),
                );
                diagnostic.source = "bpmnlint";
                if (report.rule) {
                    diagnostic.code = report.rule;
                }
                diagnostics.push(diagnostic);
            }
        }

        this.collection.set(uri, diagnostics);
    }

    clear(documentUri: string): void {
        this.collection.delete(Uri.parse(documentUri));
    }

    private severity(category: string): DiagnosticSeverity {
        switch (category) {
            case "error":
                return DiagnosticSeverity.Error;
            case "warn":
                return DiagnosticSeverity.Warning;
            default:
                return DiagnosticSeverity.Information;
        }
    }

    /**
     * Best-effort locate of the element's `id="…"` attribute in the raw XML. A
     * plain string scan (not an XML parse) keeps this cheap; a diagram-level or
     * unlocatable finding collapses to the document start.
     */
    private rangeForElement(xml: string, id: string | undefined): Range {
        const start = new Position(0, 0);
        if (!id) {
            return new Range(start, start);
        }

        const offset = xml.search(new RegExp(`\\sid=["']${escapeRegExp(id)}["']`));
        if (offset < 0) {
            return new Range(start, start);
        }

        const before = xml.slice(0, offset);
        const line = before.split("\n").length - 1;
        const column = offset - (before.lastIndexOf("\n") + 1);
        const position = new Position(line, Math.max(column, 0));
        return new Range(position, position);
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
