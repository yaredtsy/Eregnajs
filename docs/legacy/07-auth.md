# 07 — Authentication

Authentication is fully delegated to **Supabase Auth**.  
The dashboard uses the Supabase JS client; the API verifies JWTs with the service-role key.

---

## Supported auth methods (MVP)

| Method | Library | Notes |
|--------|---------|-------|
| Google OAuth 2.0 | Supabase Auth | Redirect flow |
| Email + Password | Supabase Auth | Sign-up + login |

Magic link and SSO are Phase 2.

---

## Auth flow overview

```
┌──────────────┐   signInWithOAuth / signInWithPassword   ┌──────────────┐
│   Browser    │ ──────────────────────────────────────►  │  Supabase    │
│  (Dashboard) │                                          │    Auth      │
│              │ ◄──────────────────────────────────────  │              │
│              │   session { access_token, refresh_token} └──────────────┘
│              │                                                │
│              │   API request with Authorization: Bearer <at> │
│              │ ──────────────────────────────────────────────►
│              │                                          ┌──────────────┐
│              │                                          │   API (Hono) │
│              │                                          │  getUser(at) │
│              │                                          │  → userId    │
└──────────────┘                                          └──────────────┘
```

---

## Google OAuth setup

### Supabase dashboard
1. Authentication → Providers → Google → Enable
2. Set **Client ID** and **Client Secret** from Google Cloud Console
3. Copy the **Redirect URI** shown (`https://<project>.supabase.co/auth/v1/callback`)
4. Add that URI to your Google OAuth app's "Authorized redirect URIs"

### Google Cloud Console
1. APIs & Services → Credentials → Create OAuth 2.0 Client ID
2. Application type: Web application
3. Authorized redirect URIs: add the Supabase callback URL above
4. Also add `http://localhost:54321/auth/v1/callback` for local dev

### `login.tsx` — trigger OAuth

```typescript
async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) setError(error.message)
}
```

### `auth.callback.tsx` — handle redirect

```typescript
// routes/auth.callback.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { supabase } from '#/lib/supabase'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase reads the URL hash/code automatically when getSession() is called
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: '/dashboard' })
      } else {
        navigate({ to: '/login' })
      }
    })
  }, [navigate])

  return <div>Signing you in…</div>
}
```

---

## Email + Password

### Sign-up

```typescript
async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
  // Show "check your email" message
}
```

### Sign-in

```typescript
async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  navigate({ to: '/dashboard' })
}
```

### Password reset

```typescript
async function resetPassword(email: string) {
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback?mode=reset`,
  })
}
```

---

## `useAuth` hook

Centralises session state for the dashboard.

```typescript
// src/lib/auth.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase.js'

type AuthCtx = { user: User | null; loading: boolean }

const AuthContext = createContext<AuthCtx>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Hydrate from existing session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    // Subscribe to auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
```

---

## API — JWT verification

The `authMiddleware` in `apps/api/src/middleware/auth.ts` verifies every request to `/v1/*` (except `/v1/chat/*`).

```typescript
const { data: { user }, error } = await supabase.auth.getUser(token)
// supabase.auth.getUser() contacts Supabase Auth to verify the JWT signature
// and returns the user object including user.id (= profiles.id)
```

`user.id` is stored in Hono context as `c.set('userId', user.id)` and used in every service call.

---

## Token lifecycle

| Token | Lifetime | Storage |
|-------|----------|---------|
| `access_token` (JWT) | 1 hour | `localStorage` (Supabase default) |
| `refresh_token` | 30 days (rolling) | `localStorage` |

The Supabase client auto-refreshes the access_token before expiry.  
The API validates the access_token on every request — no extra session storage needed.

---

## `profiles` auto-creation

A Postgres trigger creates a `profiles` row for every new `auth.users` row (see `02-database-models.md`).  
This means no application code needs to call `INSERT INTO profiles` — it's handled at the DB level.

---

## Row-Level Security philosophy

Every table has RLS enabled. The **only** paths to bypass RLS are:

1. The API using the **service-role key** — intentional, for widget chat + embedding generation.
2. Supabase Edge Functions (future).

The dashboard browser client uses the **anon key** — RLS is fully enforced.  
The golden rule: **the service-role key never leaves `apps/api/`**.

---

## Sign-out

```typescript
// Dashboard Header or Settings page
async function signOut() {
  await supabase.auth.signOut()
  navigate({ to: '/' })
}
```

Supabase `signOut()` clears local storage tokens and invalidates the refresh token server-side.

---

## Security checklist

- [ ] `VITE_EREGNA_SUPABASE_ANON_KEY` — public, safe to expose
- [ ] `EREGNA_SUPABASE_SERVICE_ROLE_KEY` — **never** in any `VITE_` variable
- [ ] Google OAuth redirect URIs locked to production domain + localhost
- [ ] RLS enabled on all tables — verified with `select * from pg_policies`
- [ ] Email confirmation enabled in production (Authentication → Email → Confirm email)
- [ ] `site_url` set to production domain in Supabase dashboard
