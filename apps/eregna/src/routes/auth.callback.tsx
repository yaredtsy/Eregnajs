import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '#/lib/supabase'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Completing sign-in…')

  useEffect(() => {
    const url = window.location.href

    async function finish() {
      if (url.includes('code=')) {
        const { error } = await supabase.auth.exchangeCodeForSession(url)
        if (error) {
          setMessage(error.message)
          return
        }
        navigate({ to: '/dashboard' })
        return
      }

      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) {
        setMessage(error.message)
        return
      }
      if (session) {
        navigate({ to: '/dashboard' })
        return
      }

      setMessage('Could not complete sign-in. Return to login and try again.')
    }

    void finish()
  }, [navigate])

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-6 text-cream/80">
      <p>{message}</p>
    </div>
  )
}
