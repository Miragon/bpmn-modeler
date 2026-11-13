import type { HostFileSource, SourceDependencies } from "../domain/hostText";

export interface HostTextSources {
    readDependencies(repoRoot: string): readonly SourceDependencies[];
    readSource(repoRoot: string, path: string): HostFileSource;
}
