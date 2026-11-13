const WORKSPACE_BUILD = /^(?:corepack )?(?:yarn )?workspace (\S+) build$/;
const NPM_RUN_ALL = /^npm-run-all\s/;

/**
 * The workspaces whose `build` script a `yarn <command>` runs: the command is a
 * root script or `workspace <pkg> build`, and a root script reaches workspaces
 * through `npm-run-all` tokens and `corepack yarn workspace <pkg> build`.
 */
export function workspacesBuiltBy(
    scripts: Readonly<Record<string, string>>,
    yarnCommand: string,
): string[] {
    const built = new Set<string>();
    const expanded = new Set<string>();

    const followCommand = (command: string): void => {
        const workspace = WORKSPACE_BUILD.exec(command)?.[1];
        if (workspace !== undefined) {
            built.add(workspace);
        } else if (Object.hasOwn(scripts, command)) {
            followScript(command);
        }
    };

    const followScript = (scriptName: string): void => {
        if (expanded.has(scriptName)) {
            return;
        }
        expanded.add(scriptName);
        const body = scripts[scriptName].trim();
        if (!NPM_RUN_ALL.test(body)) {
            followCommand(body);
            return;
        }
        for (const token of body.split(/\s+/).slice(1)) {
            if (token.startsWith("-")) {
                continue;
            }
            if (/[*?{]/.test(token)) {
                throw new Error(
                    `npm-run-all in the root script ${scriptName} runs the pattern ${token}; expand it here before relying on it`,
                );
            }
            if (!Object.hasOwn(scripts, token)) {
                throw new Error(
                    `npm-run-all in the root script ${scriptName} runs ${token}, which is no root script`,
                );
            }
            followScript(token);
        }
    };

    followCommand(yarnCommand.trim());
    return [...built];
}
