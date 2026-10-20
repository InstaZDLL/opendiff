import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

type Row = Record<string, unknown> & { id: string };

const tables = { codes: [] as Row[], users: [] as Row[], sessions: [] as Row[] };
let nextId = 1;
const newId = () => `id_${nextId++}`;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const c = condition as { gt?: Date; equals?: string };
      if (c.gt) return value instanceof Date && value > c.gt;
      if (c.equals !== undefined) return String(value).toLowerCase() === c.equals.toLowerCase();
    }
    return value === condition;
  });
}

const fakePrisma = {
  emailLoginCode: {
    count: async ({ where }: { where: Record<string, unknown> }) =>
      tables.codes.filter((r) => matches(r, where)).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: newId(), attempts: 0, consumedAt: null, createdAt: new Date(), ...data };
      tables.codes.push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = tables.codes.filter((r) => matches(r, where));
      for (const r of rows) Object.assign(r, data);
      return { count: rows.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = tables.codes.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
    findUnique: async ({ where }: { where: Record<string, unknown> }) =>
      tables.codes.find((r) => matches(r, where)) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...tables.codes].reverse().find((r) => matches(r, where)) ?? null,
  },
  user: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      tables.users.find((r) => matches(r, where)) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: newId(), githubId: null, avatarUrl: null, ...data };
      tables.users.push(row);
      return row;
    },
  },
  session: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: newId(), createdAt: new Date(), ...data };
      tables.sessions.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) => {
      const row = tables.sessions.find((r) => r.tokenHash === where.tokenHash);
      return row ? { ...row, user: tables.users.find((u) => u.id === row.userId) } : null;
    },
  },
};

const sentEmails: { to: string; code: string; linkUrl: string }[] = [];

mock.module("../../db", () => ({ prisma: fakePrisma }));
mock.module("../../services/email", () => ({
  sendLoginEmail: async (email: { to: string; code: string; linkUrl: string }) => {
    sentEmails.push(email);
    return { success: true };
  },
}));
mock.module("../../services/audit", () => ({ logAudit: async () => {} }));
mock.module("../../middleware/organization", () => ({ getUserOrganizations: async () => [] }));

const { emailRoutes } = await import("./email");
const { findUserBySessionToken } = await import("../../sessions");

const app = new Hono().route("/auth/email", emailRoutes);

function post(path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost/auth/email${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
      body: JSON.stringify(body),
    })
  );
}

async function requestCode(email = "dev@example.com") {
  const res = await post("/start", { email });
  expect(res.status).toBe(200);
  return sentEmails[sentEmails.length - 1];
}

describe("email sign-in", () => {
  beforeEach(() => {
    tables.codes = [];
    tables.users = [];
    tables.sessions = [];
    sentEmails.length = 0;
  });

  it("rejects an invalid email address", async () => {
    const res = await post("/start", { email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(sentEmails).toHaveLength(0);
  });

  it("emails a 6-digit code and a sign-in link", async () => {
    const sent = await requestCode("Dev@Example.com ");
    expect(sent.to).toBe("dev@example.com");
    expect(sent.code).toMatch(/^\d{6}$/);
    expect(sent.linkUrl).toContain("/login/email?token=");
    // Only hashes are stored
    expect(JSON.stringify(tables.codes)).not.toContain(sent.code);
  });

  it("signs in with the code, creates the user and issues a working session", async () => {
    const sent = await requestCode();
    const res = await post("/verify", { email: "dev@example.com", code: sent.code });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.auth_provider).toBe("email");
    expect(body.email).toBe("dev@example.com");
    expect(body.access_token).toStartWith("cst_");
    expect(tables.users).toHaveLength(1);

    const user = await findUserBySessionToken(body.access_token);
    expect(user?.id).toBe(body.visitorId);
  });

  it("signs in with the link token", async () => {
    const sent = await requestCode();
    const token = new URL(sent.linkUrl).searchParams.get("token");
    const res = await post("/verify", { token });
    expect(res.status).toBe(200);
  });

  it("only lets a code or link be used once", async () => {
    const sent = await requestCode();
    const token = new URL(sent.linkUrl).searchParams.get("token");
    expect((await post("/verify", { email: "dev@example.com", code: sent.code })).status).toBe(200);
    expect((await post("/verify", { email: "dev@example.com", code: sent.code })).status).toBe(400);
    expect((await post("/verify", { token })).status).toBe(400);
  });

  it("locks a code after 5 wrong attempts", async () => {
    const sent = await requestCode();
    const wrong = sent.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      expect((await post("/verify", { email: "dev@example.com", code: wrong })).status).toBe(400);
    }
    expect((await post("/verify", { email: "dev@example.com", code: sent.code })).status).toBe(400);
  });

  it("invalidates the previous code when a new one is requested", async () => {
    const first = await requestCode();
    const second = await requestCode();
    if (first.code !== second.code) {
      expect((await post("/verify", { email: "dev@example.com", code: first.code })).status).toBe(400);
    }
    expect((await post("/verify", { email: "dev@example.com", code: second.code })).status).toBe(200);
  });

  it("limits how many codes one address can request", async () => {
    for (let i = 0; i < 5; i++) await requestCode();
    const res = await post("/start", { email: "dev@example.com" });
    expect(res.status).toBe(429);
  });

  it("signs into an existing account with the same email", async () => {
    tables.users.push({ id: "existing", email: "Dev@Example.com", login: "dev", githubId: 42 });
    const sent = await requestCode();
    const body = await (await post("/verify", { email: "dev@example.com", code: sent.code })).json();
    expect(body.visitorId).toBe("existing");
    expect(body.hasGithubLinked).toBe(true);
    expect(tables.users).toHaveLength(1);
  });

  it("rejects unknown or expired session tokens", async () => {
    expect(await findUserBySessionToken("cst_unknown")).toBeNull();
    tables.users.push({ id: "u1", email: "a@b.co", login: "a" });
    tables.sessions.push({
      id: "s1",
      userId: "u1",
      tokenHash: (await import("../../sessions")).hashToken("cst_old"),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await findUserBySessionToken("cst_old")).toBeNull();
  });
});
