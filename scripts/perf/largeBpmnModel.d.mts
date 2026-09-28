export interface LargeModelShape {
    rows: number;
    perRow: number;
    overlapEvery?: number;
    omitDiEvery?: number;
}

export interface LargeC7Model {
    xml: string;
    flowNodeCount: number;
    sequenceFlowCount: number;
    transactionBoundaryCount: number;
    editableElementIds: string[];
}

export const largeModelPresets: Record<500 | 2000 | 5000, LargeModelShape>;

export function generateLargeC7Model(shape: LargeModelShape): LargeC7Model;
