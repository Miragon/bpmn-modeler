import { describe, expect, it } from "vitest";

import { InMemoryCommitHistory } from "../../history/__fixtures__/inMemoryCommitHistory";
import type { CommitRecord } from "../../history/domain/commitHistory";
import { REPLAY_READ_DEPTH, REPLAYED_COMMITS } from "../domain/missedPartnerReplay";
import type { SourceLayout } from "../domain/sourceLayout";
import type { SourceStructure } from "../port/SourceStructure";
import { replayMissedPartnersAtHead } from "./missedPartnerReplayService";

const FILE = "libs/core/src/a.ts";

class InMemorySourceStructure implements SourceStructure {
    readonly reads: string[] = [];

    read(repoRoot: string): SourceLayout {
        this.reads.push(repoRoot);
        return {
            files: [FILE],
            barrels: [],
            links: [],
            workspaces: [
                {
                    dir: "libs/core",
                    compositionFiles: [],
                    namedPaths: [],
                    contributesToHost: false,
                },
            ],
        };
    }
}

function history(length: number): CommitRecord[] {
    return Array.from({ length }, (_, index) => ({
        commit: `c${index}`,
        subject: "feat: change",
        changes: [{ kind: "modified", path: FILE }],
    }));
}

describe("the missed partner replay at HEAD", () => {
    it("replays the commits read from HEAD over the tree's layout", () => {
        const commits = new InMemoryCommitHistory(history(REPLAY_READ_DEPTH + 5));
        const sources = new InMemorySourceStructure();

        const replay = replayMissedPartnersAtHead({ history: commits, sources }, "/repo");

        expect(commits.requests).toEqual([
            { repoRoot: "/repo", commit: "HEAD", depth: REPLAY_READ_DEPTH },
        ]);
        expect(sources.reads).toEqual(["/repo"]);
        expect(replay).toMatchObject({ head: "c0", replayedCommits: REPLAYED_COMMITS });
    });

    it("fails before it reads the tree when the history is too short", () => {
        const sources = new InMemorySourceStructure();

        expect(() =>
            replayMissedPartnersAtHead(
                { history: new InMemoryCommitHistory(history(REPLAY_READ_DEPTH - 1)), sources },
                "/repo",
            ),
        ).toThrow(`the replay needs ${REPLAY_READ_DEPTH}`);
        expect(sources.reads).toEqual([]);
    });
});
