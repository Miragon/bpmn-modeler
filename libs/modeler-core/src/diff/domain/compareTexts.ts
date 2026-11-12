import type { DiffFileExtension } from "./diffFileExtension";

/** A file format the compare commands open, named as their menu titles name it. */
export interface CompareFormat {
    readonly extension: DiffFileExtension;
    /** Such as `BPMN`, as in "Select for Compare (BPMN)". */
    readonly label: string;
}

export function selectedForCompareText(fileName: string): string {
    return `BPMN Modeler: ${fileName} selected for compare`;
}

export function nothingSelectedForCompareText({ extension, label }: CompareFormat): string {
    return `No file selected for compare. Right-click a ${extension} file and choose "Select for Compare (${label})" first.`;
}

export const COMPARE_WITH_ITSELF_TEXT = "Cannot compare a file with itself.";

export function selectTwoFilesText({ extension }: CompareFormat): string {
    return `Select exactly two ${extension} files to compare.`;
}
