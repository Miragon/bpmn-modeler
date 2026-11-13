export interface CheckDtsOptions {
    distDir?: string;
    entries?: string[];
}

export function checkDts(options?: CheckDtsOptions): { checkedEntries: number };
