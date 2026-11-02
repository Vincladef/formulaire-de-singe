import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { SiteHeader } from './components/SiteHeader';
import { HomePage } from './pages/HomePage';
import { StudioPage } from './pages/StudioPage';
import { AuthPage } from './pages/AuthPage';
import { PublicFormPage } from './pages/PublicFormPage';
import { ProtectedStudio } from './pages/ProtectedStudio';
import { AudioResponsesPage } from './pages/AudioResponsesPage';

function AppShell() {
  const { pathname } = useLocation();
  const isPublicQuestionnaire = pathname.startsWith('/f/');
  return (
    <div className="min-h-screen bg-[#fbfcfa] text-[#253d30]">
      {!isPublicQuestionnaire && <SiteHeader />}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/connexion" element={<AuthPage />} />
          <Route path="/f/:slug" element={<PublicFormPage />} />
          <Route path="/studio" element={<ProtectedStudio><StudioPage /></ProtectedStudio>} />
          <Route path="/studio/audios" element={<ProtectedStudio><AudioResponsesPage /></ProtectedStudio>} />
          <Route path="*" element={<main className="mx-auto max-w-3xl px-5 py-28 text-center"><h1 className="font-display text-4xl font-extrabold text-[#254231]">Cette page n'existe pas.</h1><p className="mt-5 text-[#738576]">Peut-être s'est-elle égarée dans la jungle.</p><Link className="mt-6 inline-block font-semibold underline underline-offset-4" to="/">Retour à l'accueil</Link></main>} />
        </Routes>
        {!isPublicQuestionnaire && <footer className="border-t border-[#e8ede6] bg-[#fbfcfa] px-5 py-7 text-center text-xs font-medium text-[#9aa99c]">Formulaire de Singe · Une idée qui grandit, question après question.</footer>}
    </div>
  );
}
export function App() { return <BrowserRouter><AppShell /></BrowserRouter>; }
