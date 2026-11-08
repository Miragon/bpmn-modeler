import { createHash } from "node:crypto";

import { InMemoryInstalledPackages } from "./InMemoryInstalledPackages";
import { describeInstalledPackagesContract } from "./installedPackagesContract";

const ROOT = "/work";

describeInstalledPackagesContract("InMemoryInstalledPackages", () => {
    const packages = new InMemoryInstalledPackages((bytes) =>
        createHash("sha256").update(bytes).digest("hex"),
    );
    packages.createDirectory(ROOT);
    return {
        packages,
        root: ROOT,
        writeFile: (path, content) => packages.writeFile(path, content),
        createDirectory: (path) => packages.createDirectory(path),
        createSymbolicLink: (path, target) => packages.createSymbolicLink(path, target),
        dispose: () => undefined,
    };
});
