import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight } from '@repo/ui/lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="font-display text-5xl md:text-7xl font-bold text-cream mb-4">
        <span className="text-gold">Eregna</span>
      </h1>
      <p className="text-cream/70 font-body text-lg md:text-xl max-w-xl mb-10">
        Sign in with Google to open your dashboard.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-copper to-copper-dark text-charcoal font-semibold text-lg transition-all hover:shadow-lg hover:shadow-copper/30"
        >
          Log in
          <ArrowRight className="w-5 h-5" />
        </Link>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-full border-2 border-gold/50 text-gold font-semibold text-lg transition-all hover:bg-gold/10"
        >
          Dashboard
        </Link>
      </div>
    </div>
  )
}
