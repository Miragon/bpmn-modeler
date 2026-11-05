export interface StrykerReports {
    /** The parsed JSON report, or undefined when no file is at the path. */
    read(path: string): unknown;
}
