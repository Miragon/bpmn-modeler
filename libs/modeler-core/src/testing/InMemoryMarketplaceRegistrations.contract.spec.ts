import { InMemoryMarketplaceRegistrations } from "./InMemoryMarketplaceRegistrations";
import { InMemorySettings } from "./InMemorySettings";
import { describeMarketplaceRegistrationsContract } from "./marketplaceRegistrationsContract";

describeMarketplaceRegistrationsContract("InMemoryMarketplaceRegistrations", async (stored) => {
    const settings = new InMemorySettings({ marketplaces: [...stored.allProjects] });
    const registrations = new InMemoryMarketplaceRegistrations(settings);
    registrations.lists.project.push(...stored.project);
    return {
        registrations,
        settingsRead: () => settings.getMarketplaces(),
        refuseWrites: (reason) => registrations.refuseWrites(new Error(reason)),
    };
});
