import type { HexagonalWorkspaceSources } from "../domain/roleFolderSources";

export interface RoleFolderSources {
    read(repoRoot: string): readonly HexagonalWorkspaceSources[];
}
