import {
    Diagnostic,
    DiagnosticCollection,
    DiagnosticSeverity,
    languages,
    Position,
    Range,
    Uri,
} from "vscode";

import { LintResults } from "@miragon/bpmn-modeler-types";
import { DiagnosticsPort } from "@miragon/bpmn-modeler-core";

/**
 * Publishes bpmnlint findings into VS Code's Problems panel via a single shared
 * {@link DiagnosticCollection}, so lint results are searchable and clickable
 * without opening the diagram — the payoff of linting in the host.
 *
 * bpmnlint reports address elements by id, not text ranges, so the range is a
 * best-effort scan for the element's `id="…"` in the XML, falling back to the
 * document start. That is enough for the Problems entry to open the file; the
 * precise on-canvas location is still shown by the in-diagram overlay.
 *
 * Element-specific findings additionally get a clickable `code` link to a host
 * command that centres the element — the only handle a Problems entry has,
 * since VS Code discards the range for custom editors. The command id is
 * injected so this shared adapter stays decoupled from the feature that owns it.
 */
export class VsCodeDiagnostics implements DiagnosticsPort {
    private readonly collection: DiagnosticCollection =
        languages.createDiagnosticCollection("bpmnlint");

    // focusCommandId is called with (editorId, elementId); omitted → no link.
    constructor(private readonly focusCommandId?: string) {}

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
                const target =
                    report.id && this.focusCommandId
                        ? this.focusCommandTarget(documentUri, report.id)
                        : undefined;
                if (target) {
                    // Fallback label keeps the code link clickable when a finding
                    // carries no rule.
                    diagnostic.code = { value: report.rule ?? "bpmnlint", target };
                } else if (report.rule) {
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

    // Args are a JSON array in the query string (VS Code command-URI
    // convention), URI-encoded so reserved characters in ids survive.
    private focusCommandTarget(editorId: string, elementId: string): Uri {
        const args = encodeURIComponent(JSON.stringify([editorId, elementId]));
        return Uri.parse(`command:${this.focusCommandId}?${args}`);
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
