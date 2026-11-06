import { InMemoryLintingPreference } from "./inMemoryHostSurfaces";
import { InMemorySettings } from "./InMemorySettings";
import { describeLintingPreferenceContract } from "./lintingPreferenceContract";

describeLintingPreferenceContract("InMemoryLintingPreference", async () => {
    const settings = new InMemorySettings();
    return {
        preference: new InMemoryLintingPreference(settings),
        settings,
        // The fake keeps one user's settings, which every project reads.
        openAnotherProject: async () => settings,
    };
});
