import { InMemoryInstalledPackages } from "./InMemoryInstalledPackages";
import {
    describeInstalledPackagesContract,
    InstalledPackagesContractFixture,
} from "./installedPackagesContract";
import { describeRepositoryFilesContract } from "./repositoryFilesContract";

const ROOT = "/work";

function inMemoryFixture(): InstalledPackagesContractFixture {
    const packages = new InMemoryInstalledPackages();
    packages.createDirectory(ROOT);
    return {
        packages,
        root: ROOT,
        writeFile: (path, content) => packages.writeFile(path, content),
        createDirectory: (path) => packages.createDirectory(path),
        createSymbolicLink: (path, target) => packages.createSymbolicLink(path, target),
        dispose: () => undefined,
    };
}

describeInstalledPackagesContract("InMemoryInstalledPackages", inMemoryFixture);

describeRepositoryFilesContract("InMemoryInstalledPackages", () => {
    const fixture = inMemoryFixture();
    return { ...fixture, files: fixture.packages };
});
