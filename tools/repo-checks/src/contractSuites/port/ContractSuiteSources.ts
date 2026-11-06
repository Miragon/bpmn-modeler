import type { ContractSuiteInventory, CoreScope, KitLayout } from "../domain/contractSuites";

export interface ContractSuiteSources {
    readLayout(repoRoot: string): KitLayout;
    read(repoRoot: string, scope: CoreScope): ContractSuiteInventory;
}
