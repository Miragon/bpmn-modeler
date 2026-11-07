export interface CheckPluginsFreeEntriesOptions {
    distDir?: string;
}

export function checkPluginsFreeEntries(options?: CheckPluginsFreeEntriesOptions): {
    checkedEntries: string[];
};
