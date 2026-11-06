/** The rendered properties panel's expanded groups and scroll position. */
export interface PanelUiStateKeeper {
    restoreGroupsAndScroll(): void;
    startPersisting(): void;
}
