import { relativeToRoot } from "./rootContainment";

export function ancestorsUpTo(startDir: string, root: string): readonly string[] {
    const startBelowRoot = relativeToRoot(startDir, root);
    if (startBelowRoot === undefined) {
        return [];
    }

    const segmentsBelowRoot = startBelowRoot.split("/").filter((segment) => segment !== "");
    // The root keeps the host's form: on Windows, listing `c:` reads drive C's
    // current directory, not its root `c:/`.
    const ancestors = [root];
    let directory = root.endsWith("/") ? root.slice(0, -1) : root;
    for (const segment of segmentsBelowRoot) {
        directory = `${directory}/${segment}`;
        ancestors.unshift(directory);
    }
    return ancestors;
}
