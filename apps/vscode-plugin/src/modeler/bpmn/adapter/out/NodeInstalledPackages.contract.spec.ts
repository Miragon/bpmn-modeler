import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { toWorkspacePath } from "@miragon/bpmn-modeler-core";
import {
    describeInstalledPackagesContract,
    describeRepositoryFilesContract,
    InstalledPackagesContractFixture,
} from "@miragon/bpmn-modeler-core/testing";

import { NodeInstalledPackages } from "./NodeInstalledPackages";

function realDirectoryFixture(): InstalledPackagesContractFixture {
    const root = toWorkspacePath(
        realpathSync(mkdtempSync(join(tmpdir(), "installed-packages-contract-"))),
    );
    return {
        packages: new NodeInstalledPackages(),
        root,
        writeFile: (path, content) => {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, content);
        },
        createDirectory: (path) => mkdirSync(path, { recursive: true }),
        createSymbolicLink: (path, target) => symlinkSync(target, path),
        dispose: () => rmSync(root, { recursive: true, force: true }),
    };
}

describeInstalledPackagesContract(
    "VS Code's NodeInstalledPackages on a real directory",
    realDirectoryFixture,
);

describeRepositoryFilesContract("VS Code's NodeInstalledPackages on a real directory", () => {
    const fixture = realDirectoryFixture();
    return { ...fixture, files: fixture.packages };
});
