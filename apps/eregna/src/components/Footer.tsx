export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-border px-4 py-10 text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">&copy; {year} Eregna. All rights reserved.</p>
        <p className="m-0 text-sm">Built with TanStack Start &amp; Supabase</p>
      </div>
    </footer>
  )
}
