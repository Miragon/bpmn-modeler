import type { ValueSetOccurrence } from "../domain/repeatedValueSets";

export interface ValueSetSources {
    read(repoRoot: string): readonly ValueSetOccurrence[];
}
