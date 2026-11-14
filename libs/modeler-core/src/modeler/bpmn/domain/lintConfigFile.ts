import { parentWorkspacePath } from "../../../kernel/domain/workspacePath";

export const LINT_CONFIG_FILE = ".bpmnlintrc";

/** Every lint config at any depth, wherever a lint would find it. */
export const LINT_CONFIG_FILES_GLOB = `**/${LINT_CONFIG_FILE}`;

/** The folder whose `node_modules` holds the packages a lint config names. */
export function lintConfigDirOf(configPath: string): string | undefined {
    return parentWorkspacePath(configPath);
}
