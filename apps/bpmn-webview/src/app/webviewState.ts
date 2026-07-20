export interface ViewportData {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Webview state persisted via the host's `setState` / `getState`.
 */
export interface WebviewState {
    viewport?: ViewportData;
    selectedElementIds?: string[];
    panelScroll?: number;
    expandedGroupIndexes?: number[];
}
