import type { ContractSuiteInventory } from "../domain/contractSuites";

export interface ContractSuiteSources {
    read(repoRoot: string): ContractSuiteInventory | undefined;
}
