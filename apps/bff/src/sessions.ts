/** First-party login sessions (used by email sign-in). Tokens are random and stored only as SHA-256 hashes. */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";

export const SESSION_TOKEN_PREFIX = "cst_";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isSessionToken(token: string): boolean {
  return token.startsWith(SESSION_TOKEN_PREFIX);
}

/** Create a session for a user and return the raw token (only ever returned once). */
export async function createSession(userId: string): Promise<string> {
  const token = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

/** Resolve a session token to its user, or null if it is unknown or expired. */
export async function findUserBySessionToken(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return session.user;
}
