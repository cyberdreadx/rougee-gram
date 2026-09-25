import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth";
import Layout from "./components/Layout";
import Onboarding from "./pages/Onboarding";
import Unlock from "./pages/Unlock";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Reels from "./pages/Reels";
import Activity from "./pages/Activity";
import Messages from "./pages/Messages";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import PostDetail from "./pages/PostDetail";
import Settings from "./pages/Settings";
import Splash from "./components/Splash";
import Tutorial from "./components/Tutorial";
import HandleRoute from "./components/HandleRoute";

export default function App() {
  const { status } = useAuth();

  if (status === "loading") return <Splash />;
  if (status === "onboarding") return <Onboarding />;
  if (status === "locked") return <Unlock />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/reels" element={<Reels />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:id" element={<Chat />} />
        <Route path="/p/:postId" element={<PostDetail />} />
        <Route path="/u/:address" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        {/* Single-segment fallback: @username deep-links resolve here (static
            routes above rank higher); everything else redirects home. */}
        <Route path="/:handle" element={<HandleRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Tutorial />
    </Layout>
  );
}
