import { posix } from "path";

const DEPLOYABLE_EXTENSIONS = [".bpmn", ".dmn"];

const extensionNames = DEPLOYABLE_EXTENSIONS.map((extension) => extension.slice(1));

export const DEPLOYABLE_FILES_GLOB = `**/*.{${extensionNames.join(",")}}`;

export function isDeployableFile(filePath: string): boolean {
    return DEPLOYABLE_EXTENSIONS.includes(posix.extname(filePath).toLowerCase());
}
