export interface CheckDtsOptions {
    packageRoot?: string;
    distDir?: string;
    configPath?: string;
    entries?: string[];
}

export function checkDts(options?: CheckDtsOptions): {
    checkedEntries: number;
    privateLibs: number;
};
