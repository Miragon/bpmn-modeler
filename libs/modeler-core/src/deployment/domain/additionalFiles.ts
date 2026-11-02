import { excludedDirsGlob } from "../../kernel/domain/excludedDirs";

export const ADDITIONAL_FILES_GLOB = "**/*.{form,json,dmn}";

/**
 * Leaves out the modeler's own files: the config folder at any depth, which
 * the dot-folder rule misses when its name has no dot, and element templates.
 */
export function additionalFilesExclude(configFolder: string): string {
    return excludedDirsGlob("element-templates", configFolder);
}
