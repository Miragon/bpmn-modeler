export interface CheckDtsOptions {
    distDir?: string;
    configPath?: string;
    entries?: string[];
}

export function checkDts(options?: CheckDtsOptions): { checkedEntries: number };
