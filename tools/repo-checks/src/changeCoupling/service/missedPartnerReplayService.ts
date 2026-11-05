import type { CommitHistory } from "../../history/port/CommitHistory";
import {
    checkReplayDepth,
    type MissedPartnerReplay,
    REPLAY_READ_DEPTH,
    replayMissedPartnersInTree,
} from "../domain/missedPartnerReplay";
import type { SourceStructure } from "../port/SourceStructure";

export interface MissedPartnerReplayPorts {
    readonly history: CommitHistory;
    readonly sources: SourceStructure;
}

export function replayMissedPartnersAtHead(
    { history, sources }: MissedPartnerReplayPorts,
    repoRoot: string,
): MissedPartnerReplay {
    const commits = history.firstParentCommits(repoRoot, "HEAD", REPLAY_READ_DEPTH);
    checkReplayDepth(commits.length);
    return replayMissedPartnersInTree(sources.read(repoRoot), commits);
}
