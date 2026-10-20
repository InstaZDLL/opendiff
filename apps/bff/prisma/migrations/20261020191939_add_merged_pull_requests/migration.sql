-- CreateTable
CREATE TABLE "MergedPullRequest" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "pullNumber" INTEGER NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergedPullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MergedPullRequest_owner_repo_pullNumber_key" ON "MergedPullRequest"("owner", "repo", "pullNumber");
