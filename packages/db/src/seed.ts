/**
 * Development seed: creates a test auth user (and profile via trigger), one agent,
 * a small page tree, and sample elements. Requires secret-key env vars from docs/03-supabase-setup.md.
 */
import { randomUUID } from "node:crypto"
import { createServerClient } from "./client.js"
import { resolveSecretKey } from "./env.js"

const DEV_EMAIL = "test@eregna.dev"
const DEV_PASSWORD = "password123"

export async function runSeed(): Promise<void> {
  if (!process.env.EREGNA_SUPABASE_URL || !resolveSecretKey()) {
    throw new Error(
      "Missing EREGNA_SUPABASE_URL or EREGNA_SUPABASE_SECRET_KEY (see docs/03-supabase-setup.md)",
    )
  }

  const supabase = createServerClient()

  const { data: existing, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (listErr) throw listErr

  let userId = (existing?.users ?? []).find((u) => u.email === DEV_EMAIL)?.id

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Dev User" },
    })
    if (error) throw error
    if (!data.user?.id) {
      throw new Error("Failed to create dev user")
    }
    userId = data.user.id
  }

  const { data: existingAgents, error: agentsCountErr } = await supabase
    .from("agents")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
  if (agentsCountErr) throw agentsCountErr
  if (existingAgents && existingAgents.length > 0) {
    return
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle()
  if (profileErr) throw profileErr
  if (!profile) {
    throw new Error("Profile row missing after user creation; check handle_new_user trigger")
  }

  const publicId = `dev_${randomUUID().replaceAll("-", "").slice(0, 12)}`
  const secretKey = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`

  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .insert({
      owner_id: userId,
      name: "Acme Docs Agent",
      description: "Sample agent for local development",
      website_url: "https://acme.com",
      public_id: publicId,
      secret_key: secretKey,
    })
    .select("id")
    .single()
  if (agentErr) throw agentErr

  const agentId = agent.id

  const { data: rootPage, error: rootErr } = await supabase
    .from("pages")
    .insert({
      agent_id: agentId,
      path: "root",
      title: "Home",
      url_pattern: "/",
      sort_order: 0,
    })
    .select("id")
    .single()
  if (rootErr) throw rootErr

  const { data: docsPage, error: docsErr } = await supabase
    .from("pages")
    .insert({
      agent_id: agentId,
      path: "root.docs",
      parent_id: rootPage.id,
      title: "Docs",
      url_pattern: "/docs",
      sort_order: 1,
    })
    .select("id")
    .single()
  if (docsErr) throw docsErr

  const { data: apiPage, error: apiErr } = await supabase
    .from("pages")
    .insert({
      agent_id: agentId,
      path: "root.docs.api",
      parent_id: docsPage.id,
      title: "API",
      url_pattern: "/docs/api",
      sort_order: 2,
    })
    .select("id")
    .single()
  if (apiErr) throw apiErr

  const pageTriples: { id: string; paths: [string, string, string][] }[] = [
    {
      id: rootPage.id,
      paths: [
        ["hero", "Hero", "Main hero section"],
        ["footer", "Footer", "Site footer"],
        ["cta", "CTA", "Call to action"],
      ],
    },
    {
      id: docsPage.id,
      paths: [
        ["sidebar", "Sidebar", "Documentation sidebar"],
        ["content", "Content", "Main doc body"],
        ["toc", "TOC", "Table of contents"],
      ],
    },
    {
      id: apiPage.id,
      paths: [
        ["endpoints", "Endpoints", "API endpoint list"],
        ["auth_block", "Auth", "Authentication section"],
        ["examples", "Examples", "Code examples"],
      ],
    },
  ]

  for (const { id: pageId, paths } of pageTriples) {
    const rows = paths.map(([path, label, description], i) => ({
      page_id: pageId,
      path,
      label,
      description,
      sort_order: i,
    }))
    const { error: elErr } = await supabase.from("elements").insert(rows)
    if (elErr) throw elErr
  }
}
