import type { FitnessReport } from "./report";

const REPORT_SCHEMA_VERSION = 1;

export function jsonReport(report: FitnessReport): string {
    return `${JSON.stringify({ schemaVersion: REPORT_SCHEMA_VERSION, ...report }, null, 2)}\n`;
}
