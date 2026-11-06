import type { SourceDependencies, WrittenText } from "../domain/hostText";

export interface HostTextSources {
    readDependencies(repoRoot: string): readonly SourceDependencies[];
    readTexts(repoRoot: string, path: string): readonly WrittenText[];
}
