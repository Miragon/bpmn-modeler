import { posix } from "path";

export function toWorkspacePath(path: string): string {
    return posix.normalize(path.replace(/\\/g, "/"));
}

export function joinWorkspacePath(directory: string, ...segments: string[]): string {
    return posix.join(directory, ...segments);
}
