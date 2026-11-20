import {lazy, Suspense, StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import Landing from './Landing'
import {ToastProvider} from './Toast'
import './style.css'

const App=lazy(()=>import('./App'))
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:8000,refetchOnWindowFocus:false}}})
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}>
 {location.pathname.startsWith('/app')?<Suspense fallback={<main className="section" aria-busy="true">Abriendo Mercury…</main>}><ToastProvider><App/></ToastProvider></Suspense>:<Landing/>}
</QueryClientProvider></StrictMode>)
