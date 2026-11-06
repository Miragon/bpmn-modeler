import { describeDeploymentStateContract } from "./deploymentStateContract";
import { InMemoryDeploymentState } from "./InMemoryDeploymentState";

describeDeploymentStateContract("InMemoryDeploymentState", async () => {
    const deploymentState = new InMemoryDeploymentState();
    return {
        deploymentState,
        reopen: () => {
            const next = new InMemoryDeploymentState();
            next.seed(deploymentState.load());
            return next;
        },
        rejectWrites: (reason) => deploymentState.failSaves(() => true, new Error(reason)),
    };
});
