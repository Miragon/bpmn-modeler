export function ancestorsUpTo(startDir: string, root: string): readonly string[] {
    const rootPrefix = withTrailingSlash(root);
    const start = withTrailingSlash(startDir);
    if (!start.startsWith(rootPrefix)) {
        return [];
    }

    const segmentsBelowRoot = start
        .slice(rootPrefix.length)
        .split("/")
        .filter((segment) => segment !== "");
    // The root keeps the host's form: on Windows, listing `c:` reads drive C's
    // current directory, not its root `c:/`.
    const ancestors = [root];
    let directory = rootPrefix.slice(0, -1);
    for (const segment of segmentsBelowRoot) {
        directory = `${directory}/${segment}`;
        ancestors.unshift(directory);
    }
    return ancestors;
}

function withTrailingSlash(path: string): string {
    return path.endsWith("/") ? path : `${path}/`;
}
