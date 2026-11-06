import type { DeploymentHost } from "../../port/deploymentHost";

export function initTabs(host: DeploymentHost): void {
    const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
    const tabPanels = document.querySelectorAll<HTMLElement>(".tab-panel");

    const savedTab = host.getState()?.activeTab;
    if (savedTab) {
        activateTab(savedTab, tabBtns, tabPanels);
    }

    for (const btn of tabBtns) {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            if (!tab) return;
            activateTab(tab, tabBtns, tabPanels);
            host.updateState({ activeTab: tab });
        });
    }
}

function activateTab(
    tab: string,
    tabBtns: NodeListOf<HTMLButtonElement>,
    tabPanels: NodeListOf<HTMLElement>,
): void {
    for (const btn of tabBtns) {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    }
    for (const panel of tabPanels) {
        panel.classList.toggle("active", panel.id === `tab-${tab}`);
    }
}
