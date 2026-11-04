import type { HexagonalWorkspaceSources } from "../domain/hexagonalWorkspaceSources";

export interface RoleFolderSources {
    read(repoRoot: string): readonly HexagonalWorkspaceSources[];
}
