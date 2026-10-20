/** Merged pull requests that Contrast reviewed: recording them and the public total. */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";

const COUNT_TTL_MS = 60_000;

export interface MergedPullRequestInput {
  owner: string;
  repo: string;
  pullNumber: number;
  mergedAt: Date;
}

type MergedPullRequestDb = Pick<PrismaClient, "review" | "mergedPullRequest">;

/** Builds the service around a database client, looked up on each call (the app passes the shared Prisma client). */
export function createMergedPullRequestService(getDb: () => MergedPullRequestDb) {
  let cachedCount: { value: number; expires: number } | null = null;

  /** Record a merged pull request, but only if Contrast reviewed it. */
  async function record({
    owner,
    repo,
    pullNumber,
    mergedAt,
  }: MergedPullRequestInput): Promise<"recorded" | "not_reviewed"> {
    const db = getDb();
    const review = await db.review.findFirst({
      where: {
        pullNumber,
        repositorySettings: {
          owner: { equals: owner, mode: "insensitive" },
          repo: { equals: repo, mode: "insensitive" },
        },
      },
      select: { id: true },
    });
    if (!review) return "not_reviewed";

    const key = { owner: owner.toLowerCase(), repo: repo.toLowerCase(), pullNumber };
    await db.mergedPullRequest.upsert({
      where: { owner_repo_pullNumber: key },
      create: { ...key, mergedAt },
      update: { mergedAt },
    });
    cachedCount = null;
    return "recorded";
  }

  /** Total merged pull requests reviewed by Contrast, cached for a minute. */
  async function count(): Promise<number> {
    if (cachedCount && cachedCount.expires > Date.now()) return cachedCount.value;
    const value = await getDb().mergedPullRequest.count();
    cachedCount = { value, expires: Date.now() + COUNT_TTL_MS };
    return value;
  }

  return { record, count };
}

const service = createMergedPullRequestService(() => prisma);

export const recordMergedPullRequest = service.record;
export const countMergedPullRequests = service.count;
