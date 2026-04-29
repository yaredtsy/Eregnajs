import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

let browserClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    return new QueryClient({
      defaultOptions: { queries: { retry: 1 } },
    })
  }
  if (!browserClient) {
    browserClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, retry: 1 },
      },
    })
  }
  return browserClient
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const client = getQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
