import { Link } from '@tanstack/react-router'
import { useAuth } from '#/lib/auth'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  const { user, loading } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 px-4 backdrop-blur-lg">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground no-underline shadow-sm sm:px-4 sm:py-2"
          >
            <span className="h-2 w-2 rounded-full bg-gradient-to-r from-copper to-gold" />
            Eregna
          </Link>
        </h2>

        <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground no-underline transition hover:bg-muted hover:text-foreground"
          >
            Home
          </Link>
          {loading ? (
            <span className="text-sm text-muted-foreground">…</span>
          ) : user ? (
            <Link
              to="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground no-underline transition hover:bg-muted hover:text-foreground"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-gold no-underline transition hover:bg-gold/10"
            >
              Log in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
