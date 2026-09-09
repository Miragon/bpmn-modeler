export interface CheckInlinedPeersOptions {
    packageRoot?: string;
    configPath?: string;
    manifestPath?: string;
}

export function checkInlinedPeers(options?: CheckInlinedPeersOptions): { checkedLibraries: number };
