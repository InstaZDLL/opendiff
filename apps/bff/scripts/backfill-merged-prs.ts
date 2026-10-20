/**
 * Data migration script: record already-merged pull requests that Contrast reviewed,
 * so the public "PRs merged" total includes history from before merge tracking existed.
 * Safe to run more than once.
 *
 * Run locally with: bun apps/bff/scripts/backfill-merged-prs.ts
 * On the server:    docker compose -f docker-compose.prod.yml run --rm bff bun apps/bff/scripts/backfill-merged-prs.ts
 */

import { getInstallationTokenForRepo } from "@opendiff/github";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfillMergedPullRequests() {
  const reviewed = await prisma.review.findMany({
    where: { repositorySettingsId: { not: null } },
    distinct: ["repositorySettingsId", "pullNumber"],
    select: { pullNumber: true, repositorySettings: { select: { owner: true, repo: true } } },
  });

  console.log(`Checking ${reviewed.length} reviewed pull requests...\n`);

  const tokens = new Map<string, string | null>();
  let recorded = 0;
  let notMerged = 0;
  let unreachable = 0;

  for (const { pullNumber, repositorySettings } of reviewed) {
    if (!repositorySettings) continue;
    const { owner, repo } = repositorySettings;
    const repoKey = `${owner}/${repo}`;

    if (!tokens.has(repoKey)) {
      tokens.set(repoKey, await getInstallationTokenForRepo(owner, repo).catch(() => null));
    }
    const token = tokens.get(repoKey);
    if (!token) {
      unreachable++;
      continue;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      unreachable++;
      continue;
    }

    const pr = (await res.json()) as { merged: boolean; merged_at: string | null };
    if (!pr.merged || !pr.merged_at) {
      notMerged++;
      continue;
    }

    await prisma.mergedPullRequest.upsert({
      where: {
        owner_repo_pullNumber: { owner: owner.toLowerCase(), repo: repo.toLowerCase(), pullNumber },
      },
      create: {
        owner: owner.toLowerCase(),
        repo: repo.toLowerCase(),
        pullNumber,
        mergedAt: new Date(pr.merged_at),
      },
      update: { mergedAt: new Date(pr.merged_at) },
    });
    recorded++;
  }

  console.log(`Recorded ${recorded} merged, ${notMerged} not merged, ${unreachable} unreachable.`);
  console.log(`Total merged pull requests: ${await prisma.mergedPullRequest.count()}`);
}

backfillMergedPullRequests()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
