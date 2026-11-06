import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeSettings, parseSetting } from "../kernel/domain/modelerSettings";
import { registeredMarketplaces } from "../template-marketplace/domain/marketplaceRegistrations";
import { InMemorySettings } from "./InMemorySettings";
import { describeSettingsContract } from "./settingsContract";

// The fake holds what a host's read hands the core, so the fixture reads the stored settings as a host does.
describeSettingsContract(
    "InMemorySettings",
    async () => {
        const settings = new InMemorySettings();
        return {
            settings,
            store: async (stored, projectMarketplaces) => {
                const marketplaces = registeredMarketplaces({
                    allProjects: parseSetting("marketplaces", stored.marketplaces),
                    project: parseSetting("marketplaces", projectMarketplaces),
                }).map(({ entry }) => entry);
                Object.assign(settings.values, normalizeSettings({ ...stored, marketplaces }));
            },
        };
    },
    readFileSync(resolve(__dirname, "../kernel/domain/settingsNormalization.cases.json"), "utf8"),
);
