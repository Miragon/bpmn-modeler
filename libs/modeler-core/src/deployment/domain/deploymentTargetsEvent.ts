import { TargetEdit } from "./deploymentDestination";

/** One successful change of the targets file or of the active target. */
export type DeploymentTargetsEvent =
    | { readonly kind: "activeTargetChanged"; readonly activeName: string }
    | {
          readonly kind: "targetsChanged";
          readonly edit: TargetEdit;
          /** The retired target's ledger identity reads `.env` only inside this directory's workspace folder. */
          readonly documentDir: string | undefined;
      };

export type DeploymentTargetsListener = (event: DeploymentTargetsEvent) => Promise<void> | void;
