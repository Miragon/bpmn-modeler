import type { ValueSetInventory } from "../domain/repeatedValueSets";

export interface ValueSetSources {
    read(repoRoot: string): ValueSetInventory;
}
