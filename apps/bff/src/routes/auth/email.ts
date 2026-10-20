/** Email sign-in: sends a one-time code + link, then exchanges either for a first-party session. */
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../../db";
import { getUserOrganizations } from "../../middleware/organization";
import { logAudit } from "../../services/audit";
import { sendLoginEmail } from "../../services/email";
import { createSession, hashToken } from "../../sessions";
import { FRONTEND_URL, extractClientIp, sanitizeRedirectUrl, verifyTurnstileToken } from "./utils";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODES_PER_WINDOW = 5;
const CODE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailRoutes = new Hono();

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

emailRoutes.post("/start", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);

  if (!email) {
    return c.json({ error: "Enter a valid email address." }, 400);
  }

  const isHuman = await verifyTurnstileToken({
    token: body.turnstileToken,
    ip: extractClientIp(c.req),
  });
  if (!isHuman) {
    return c.json({ error: "Human verification failed. Please try again." }, 403);
  }

  const recentCodes = await prisma.emailLoginCode.count({
    where: { email, createdAt: { gt: new Date(Date.now() - CODE_WINDOW_MS) } },
  });
  if (recentCodes >= MAX_CODES_PER_WINDOW) {
    return c.json({ error: "Too many codes requested. Try again in a few minutes." }, 429);
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const linkToken = randomBytes(32).toString("base64url");

  // A new code replaces any earlier one that hasn't been used yet
  await prisma.emailLoginCode.updateMany({
    where: { email, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.emailLoginCode.create({
    data: {
      email,
      codeHash: hashToken(code),
      tokenHash: hashToken(linkToken),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  const linkUrl = new URL(`${FRONTEND_URL}/login/email`);
  linkUrl.searchParams.set("token", linkToken);
  const redirectUrl = sanitizeRedirectUrl(body.redirectUrl);
  if (redirectUrl) linkUrl.searchParams.set("redirectUrl", redirectUrl);

  await sendLoginEmail({ to: email, code, linkUrl: linkUrl.toString() });

  // Same response whether or not an account exists, so this can't be used to probe emails
  return c.json({ ok: true });
});

emailRoutes.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const now = new Date();

  let record: Awaited<ReturnType<typeof prisma.emailLoginCode.findFirst>> = null;

  if (typeof body.token === "string" && body.token) {
    record = await prisma.emailLoginCode.findUnique({ where: { tokenHash: hashToken(body.token) } });
  } else {
    const email = normalizeEmail(body.email);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!email || !/^\d{6}$/.test(code)) {
      return c.json({ error: "Enter the 6-digit code from your email." }, 400);
    }

    record = await prisma.emailLoginCode.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (record && !hashesMatch(record.codeHash, hashToken(code))) {
      const attempts = record.attempts + 1;
      await prisma.emailLoginCode.update({
        where: { id: record.id },
        data: { attempts, ...(attempts >= MAX_ATTEMPTS && { consumedAt: now }) },
      });
      return c.json({ error: "That code isn't right. Check your email and try again." }, 400);
    }
  }

  if (!record || record.consumedAt || record.expiresAt <= now || record.attempts >= MAX_ATTEMPTS) {
    return c.json({ error: "This code or link has expired or was already used. Request a new one." }, 400);
  }

  // Mark used atomically so a code or link can only be redeemed once
  const consumed = await prisma.emailLoginCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) {
    return c.json({ error: "This code or link has expired or was already used. Request a new one." }, 400);
  }

  const email = record.email;
  let user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!user) {
    const login = email.split("@")[0].replace(/[^a-z0-9]/g, "");
    user = await prisma.user.create({ data: { email, login, name: null } });
  }

  const accessToken = await createSession(user.id);
  const organizations = await getUserOrganizations(user.id);

  await logAudit({
    userId: user.id,
    action: "user.login",
    metadata: { login: user.login, provider: "email" },
    c,
  });

  return c.json({
    id: user.id,
    visitorId: user.id,
    login: user.login,
    name: user.name,
    avatar_url: user.avatarUrl,
    email: user.email,
    access_token: accessToken,
    auth_provider: "email",
    hasGithubLinked: !!user.githubId,
    subscriptionTier: user.subscriptionTier,
    subscriptionStatus: user.subscriptionStatus,
    accountType: user.accountType,
    onboardingCompletedAt: user.onboardingCompletedAt,
    personalOrgId: user.personalOrgId,
    organizations,
    hasOrganizations: organizations.length > 0,
  });
});

export { emailRoutes };
