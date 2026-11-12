import { LOCAL_HOST } from "../kernel/domain/allowance";
import { RepositoryFilesPort } from "../kernel/port/repositoryFilesPort";
import { AllowanceLocator } from "../kernel/service/AllowanceLocator";

const NO_GIT_FILES: RepositoryFilesPort = {
    realPath: (path) => path,
    entryKindOf: () => undefined,
    readTextFile: () => undefined,
};

/** Every add-on is its own folder origin, the unit 1.21.0 approved, for specs that ignore repositories. */
export function folderOriginAllowances(host: string = LOCAL_HOST): AllowanceLocator {
    return new AllowanceLocator(NO_GIT_FILES, host);
}
