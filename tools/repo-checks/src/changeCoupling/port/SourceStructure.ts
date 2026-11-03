import type { SourceLayout } from "../domain/sourceLayout";

export interface SourceStructure {
    read(repoRoot: string): SourceLayout;
}
