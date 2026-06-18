/**
 * Dev guide agent seed (docs/v2/7-guide-agent).
 * Idempotent: safe to run many times.
 */
import { randomUUID } from "node:crypto";
import { createServerClient } from "./client.js";
import { resolveSecretKey } from "./env.js";
import {
  GUIDE_AGENT,
  GUIDE_ELEMENTS,
  GUIDE_EMAIL,
  GUIDE_PAGE,
  GUIDE_PASSWORD_DEFAULT,
  GUIDE_PUBLIC_ID_DEFAULT,
  GUIDE_ALLOWED_ORIGINS_DEFAULT,
  GUIDE_SITE_FACTS,
} from "./guide-agent-data.js";

function log(action: "created" | "skipped" | "updated", what: string) {
  console.log(`[guide-seed] ${action}: ${what}`);
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [...GUIDE_ALLOWED_ORIGINS_DEFAULT];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runGuideAgentSeed(): Promise<{ publicId: string }> {
  if (!process.env.EREGNA_SUPABASE_URL || !resolveSecretKey()) {
    throw new Error(
      "Missing EREGNA_SUPABASE_URL or EREGNA_SUPABASE_SECRET_KEY (see docs/legacy/03-supabase-setup.md)",
    );
  }

  const supabase = createServerClient();
  const publicId = process.env.EREGNA_GUIDE_PUBLIC_ID?.trim() || GUIDE_PUBLIC_ID_DEFAULT;
  const allowedOrigins = parseOrigins(process.env.EREGNA_GUIDE_ALLOWED_ORIGINS);
  const guidePassword =
    process.env.EREGNA_GUIDE_PASSWORD?.trim() || GUIDE_PASSWORD_DEFAULT;

  // --- Auth user (platform owner) ---
  const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;

  let ownerId = (listed?.users ?? []).find((u) => u.email === GUIDE_EMAIL)?.id;

  if (!ownerId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: GUIDE_EMAIL,
      password: guidePassword,
      email_confirm: true,
      user_metadata: { full_name: "Eregna Guide" },
    });
    if (error) throw error;
    if (!data.user?.id) throw new Error("Failed to create guide user");
    ownerId = data.user.id;
    log("created", `user ${GUIDE_EMAIL}`);
  } else {
    log("skipped", `user ${GUIDE_EMAIL}`);
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", ownerId)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile) {
    throw new Error("Profile row missing for guide user; check handle_new_user trigger");
  }

  // --- Agent ---
  const { data: existingAgent } = await supabase
    .from("agents")
    .select("id, public_id")
    .eq("public_id", publicId)
    .maybeSingle();

  let agentId: string;

  if (existingAgent) {
    agentId = existingAgent.id;
    const { error: updErr } = await supabase
      .from("agents")
      .update({
        name: GUIDE_AGENT.name,
        description: GUIDE_AGENT.description,
        website_url: GUIDE_AGENT.website_url,
        model: GUIDE_AGENT.model,
        system_prompt: GUIDE_AGENT.system_prompt,
        is_active: true,
        allowed_origins: allowedOrigins,
      })
      .eq("id", agentId);
    if (updErr) throw updErr;
    log("updated", `agent ${publicId}`);
  } else {
    const secretKey = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .insert({
        owner_id: ownerId,
        name: GUIDE_AGENT.name,
        description: GUIDE_AGENT.description,
        website_url: GUIDE_AGENT.website_url,
        public_id: publicId,
        secret_key: secretKey,
        model: GUIDE_AGENT.model,
        system_prompt: GUIDE_AGENT.system_prompt,
        is_active: true,
        allowed_origins: allowedOrigins,
      })
      .select("id")
      .single();
    if (agentErr) throw agentErr;
    agentId = agent.id;
    log("created", `agent ${publicId}`);
  }

  // --- Page ---
  const { data: pages } = await supabase
    .from("pages")
    .select("id, title")
    .eq("agent_id", agentId);

  let pageId = pages?.find((p) => p.title === GUIDE_PAGE.title)?.id;

  if (!pageId) {
    const { data: page, error: pageErr } = await supabase
      .from("pages")
      .insert({
        agent_id: agentId,
        path: GUIDE_PAGE.path,
        title: GUIDE_PAGE.title,
        url_pattern: GUIDE_PAGE.url_pattern,
        description: GUIDE_PAGE.description,
        sort_order: GUIDE_PAGE.sort_order,
      })
      .select("id")
      .single();
    if (pageErr) throw pageErr;
    pageId = page.id;
    log("created", `page ${GUIDE_PAGE.title}`);
  } else {
    const { error: pageUpdErr } = await supabase
      .from("pages")
      .update({
        url_pattern: GUIDE_PAGE.url_pattern,
        description: GUIDE_PAGE.description,
        sort_order: GUIDE_PAGE.sort_order,
      })
      .eq("id", pageId);
    if (pageUpdErr) throw pageUpdErr;
    log("skipped", `page ${GUIDE_PAGE.title}`);
  }

  // --- Elements ---
  const { data: existingEls } = await supabase
    .from("elements")
    .select("key")
    .eq("page_id", pageId);

  const haveKeys = new Set((existingEls ?? []).map((e) => e.key));

  for (const el of GUIDE_ELEMENTS) {
    if (haveKeys.has(el.key)) {
      log("skipped", `element ${el.key}`);
      continue;
    }
    const { error: elErr } = await supabase.from("elements").insert({
      page_id: pageId,
      path: el.path,
      label: el.label,
      key: el.key,
      dom_id: el.dom_id,
      selectors: el.selectors,
      description: el.description,
      notes: el.notes,
      sort_order: el.sort_order,
    });
    if (elErr) throw elErr;
    log("created", `element ${el.key}`);
  }

  // --- Site facts ---
  const { data: existingFacts } = await supabase
    .from("site_facts")
    .select("title")
    .eq("agent_id", agentId);

  const haveTitles = new Set((existingFacts ?? []).map((f) => f.title));

  for (const fact of GUIDE_SITE_FACTS) {
    if (haveTitles.has(fact.title)) {
      log("skipped", `site fact ${fact.title}`);
      continue;
    }
    const { error: factErr } = await supabase.from("site_facts").insert({
      agent_id: agentId,
      title: fact.title,
      content: fact.content,
      sort_order: fact.sort_order,
    });
    if (factErr) throw factErr;
    log("created", `site fact ${fact.title}`);
  }

  console.log("");
  console.log("Guide agent ready.");
  console.log(`  public_id: ${publicId}`);
  console.log(`  allowed_origins: ${allowedOrigins.join(", ")}`);
  console.log("");
  console.log("Add to apps/eregna/.env:");
  console.log(`  VITE_EREGNA_GUIDE_AGENT_ID=${publicId}`);
  console.log("");

  return { publicId };
}
