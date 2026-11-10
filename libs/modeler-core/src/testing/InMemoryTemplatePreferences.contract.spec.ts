import { InMemoryTemplatePreferences } from "./InMemoryTemplatePreferences";
import { describeTemplatePreferenceStoreContract } from "./templatePreferenceStoreContract";

describeTemplatePreferenceStoreContract("InMemoryTemplatePreferences", async () => {
    const store = new InMemoryTemplatePreferences();
    return {
        store,
        storeElsewhere: async (scope, preferences, options) =>
            store.storeElsewhere(scope, preferences, options),
    };
});
