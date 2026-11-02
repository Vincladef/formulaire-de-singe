import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authClient } from '../authClient';

export function ProtectedStudio({children}:{children:ReactNode}) {
  // UI check is for UX only; server independently verifies every Bearer JWT.
  if (!authClient) return <main className="mx-auto max-w-xl px-5 py-20"><h1 className="text-2xl font-bold">Connexion indisponible</h1><p>Configurer VITE_NEON_AUTH_URL dans Netlify pour activer le Studio.</p></main>;
  return <SessionGate>{children}</SessionGate>;
}
function SessionGate({children}:{children:ReactNode}) {
  const session = authClient!.useSession();
  if (session.isPending) return <main role="status" className="p-20 text-center">Vérification de la session…</main>;
  if (!session.data?.user) return <Navigate to="/connexion" replace/>;
  return <>{children}</>;
}
