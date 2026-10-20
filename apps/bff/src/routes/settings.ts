import { Hono } from "hono";
import { getOrgIdFromHeader } from "../auth";
import { prisma } from "../db";
import { getAuthUser, requireAuth, requireOrgAccess } from "../middleware/auth";
import { canManageBilling } from "../middleware/organization";
import { logAudit } from "../services/audit";
import { getSupportedProviderModels } from "../utils/opencode-models";

const settingsRoutes = new Hono();

settingsRoutes.use(requireAuth());

// ==================== BYOK AI CONFIG ENDPOINTS ====================

type AiAuthMethod = "API_KEY";
type AiProvider = "anthropic" | "openai";

const DEFAULT_PROVIDER: AiProvider = "openai";
const DEFAULT_AUTH_METHOD: AiAuthMethod = "API_KEY";
const DEFAULT_MODEL = "openai/gpt-5.2-codex";

function providerFromModel(model: string | null | undefined): AiProvider | null {
  if (model?.startsWith("openai/")) {
    return "openai";
  }
  if (model?.startsWith("anthropic/")) {
    return "anthropic";
  }
  return null;
}

function displayProviderFromModel(model: string | null | undefined): AiProvider {
  const provider = providerFromModel(model);
  if (provider) {
    return provider;
  }
  return "anthropic";
}

function maskCredential(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith("sk-ant-")) {
    return `sk-ant-...${value.slice(-4)}`;
  }
  if (value.startsWith("sk-")) {
    return `sk-...${value.slice(-4)}`;
  }
  return `...${value.slice(-4)}`;
}

// Get AI config status (never returns the actual credential)
settingsRoutes.get("/ai-config", async (c) => {
  const user = getAuthUser(c);

  const orgId = getOrgIdFromHeader(c);
  if (!orgId) {
    return c.json({ error: "Organization ID is required" }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { members: true },
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (!org.members.some((m) => m.userId === user.id)) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  const authMethod: AiAuthMethod | null =
    org.aiAuthMethod === "API_KEY" || org.anthropicApiKey ? "API_KEY" : null;
  const storedCredential = authMethod === "API_KEY" ? org.aiApiKey || org.anthropicApiKey : null;

  const hasCredential = !!storedCredential;
  const maskedCredential = maskCredential(storedCredential);

  return c.json({
    hasCredential,
    authMethod: authMethod || DEFAULT_AUTH_METHOD,
    provider: org.aiModel ? displayProviderFromModel(org.aiModel) : DEFAULT_PROVIDER,
    model: org.aiModel || DEFAULT_MODEL,
    maskedCredential,
    tier: org.subscriptionTier,
  });
});

settingsRoutes.get("/ai-models", async (c) => {
  const provider = (c.req.query("provider") || "") as AiProvider | "";
  const modelsByProvider = await getSupportedProviderModels();

  if (provider === "anthropic" || provider === "openai") {
    return c.json({
      provider,
      models: modelsByProvider[provider],
    });
  }

  return c.json({
    providers: ["anthropic", "openai"],
    modelsByProvider,
  });
});

// Set AI config (BYOK organizations only — owners only)
settingsRoutes.put("/ai-config", async (c) => {
  const user = getAuthUser(c);

  const orgId = getOrgIdFromHeader(c);
  if (!orgId) {
    return c.json({ error: "Organization ID is required" }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { members: true },
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const membership = org.members.find((m) => m.userId === user.id);
  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can manage API keys" }, 403);
  }

  if (org.subscriptionTier !== "SELF_SUFFICIENT") {
    return c.json({ error: "API key is only available for Self-sufficient plan" }, 403);
  }

  const body = await c.req.json();
  const { provider, authMethod, model, credential } = body as {
    provider?: AiProvider;
    authMethod?: string;
    model?: string;
    credential?: string;
  };

  const modelProvider = providerFromModel(model);
  if (!model || !modelProvider) {
    return c.json({ error: "Invalid model selection" }, 400);
  }

  if (provider && provider !== modelProvider) {
    return c.json({ error: "provider must match selected model" }, 400);
  }

  if (authMethod && authMethod !== "API_KEY") {
    return c.json({ error: "Self-sufficient plan accepts provider API keys only" }, 400);
  }

  const supportedModels = await getSupportedProviderModels();
  if (!supportedModels[modelProvider].some((m) => m.id === model)) {
    return c.json({ error: "Selected model is not supported" }, 400);
  }

  if (!credential || typeof credential !== "string") {
    return c.json({ error: "Credential is required" }, 400);
  }

  if (modelProvider === "anthropic" && !credential.startsWith("sk-ant-")) {
    return c.json({ error: "Invalid Anthropic API key format" }, 400);
  }

  if (modelProvider === "openai" && !credential.startsWith("sk-")) {
    return c.json({ error: "Invalid OpenAI API key format" }, 400);
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      aiAuthMethod: "API_KEY",
      aiModel: model,
      aiApiKey: credential,
      aiOauthToken: null,
      aiOauthRefreshToken: null,
      aiOauthAccountId: null,
      anthropicApiKey: modelProvider === "anthropic" ? credential : null,
    },
  });

  await logAudit({
    organizationId: org.id,
    userId: user.id,
    action: "api_key.updated",
    metadata: { provider: modelProvider, authMethod: "API_KEY", model },
    c,
  });

  return c.json({
    success: true,
    provider: modelProvider,
    authMethod: "API_KEY",
    model,
    maskedCredential: maskCredential(credential),
  });
});

// Delete AI config (owners only)
settingsRoutes.delete("/ai-config", async (c) => {
  const user = getAuthUser(c);

  const orgId = getOrgIdFromHeader(c);
  if (!orgId) {
    return c.json({ error: "Organization ID is required" }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { members: true },
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const membership = org.members.find((m) => m.userId === user.id);
  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can manage API keys" }, 403);
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      aiAuthMethod: null,
      aiModel: null,
      aiApiKey: null,
      aiOauthToken: null,
      aiOauthRefreshToken: null,
      aiOauthAccountId: null,
      anthropicApiKey: null,
    },
  });

  await logAudit({
    organizationId: org.id,
    userId: user.id,
    action: "api_key.deleted",
    c,
  });

  return c.json({ success: true });
});

// ==================== CUSTOM REVIEW RULES ENDPOINTS ====================

// Get custom review rules
settingsRoutes.get("/review-rules", async (c) => {
  const user = getAuthUser(c);

  return c.json({
    rules: user.customReviewRules || "",
  });
});

// Update custom review rules
settingsRoutes.put("/review-rules", async (c) => {
  const user = getAuthUser(c);

  const body = await c.req.json();
  const { rules } = body;

  if (typeof rules !== "string") {
    return c.json({ error: "Rules must be a string" }, 400);
  }

  // Limit rules to 5000 characters
  if (rules.length > 5000) {
    return c.json({ error: "Rules must be 5000 characters or less" }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { customReviewRules: rules || null },
  });

  await logAudit({
    organizationId: (await requireOrgAccess(c)) ?? undefined,
    userId: user.id,
    action: "review_rules.updated",
    metadata: { rulesLength: rules.length },
    c,
  });

  return c.json({ success: true, rules });
});

export { settingsRoutes };
