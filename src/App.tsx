import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./store/auth";
import Layout from "./components/Layout";
import Onboarding from "./pages/Onboarding";
import Unlock from "./pages/Unlock";
import PostGate from "./pages/PostGate";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Reels from "./pages/Reels";
import Activity from "./pages/Activity";
import Messages from "./pages/Messages";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import NostrProfile from "./pages/NostrProfile";
import PostDetail from "./pages/PostDetail";
import Settings from "./pages/Settings";
import Splash from "./components/Splash";
import Tutorial from "./components/Tutorial";
import HandleRoute from "./components/HandleRoute";
import { DMS_ENABLED } from "./lib/features";
import TagPage from "./pages/TagPage";
import LocationPage from "./pages/LocationPage";

export default function App() {
  const { status } = useAuth();
  const { pathname } = useLocation();

  if (status === "loading") return <Splash />;
  // A shared post link opened without an account shows a gated teaser (author +
  // stats, photo blurred) instead of the bare Welcome screen. The URL stays
  // /p/:id, so finishing signup from there lands on the real post.
  if (status === "onboarding" || status === "locked") {
    const sharedPost = pathname.match(/^\/p\/([^/]+)/)?.[1];
    if (sharedPost) return <PostGate postId={sharedPost} />;
  }
  if (status === "onboarding") return <Onboarding />;
  if (status === "locked") return <Unlock />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/reels" element={<Reels />} />
        <Route path="/activity" element={<Activity />} />
        {DMS_ENABLED && <Route path="/messages" element={<Messages />} />}
        {DMS_ENABLED && <Route path="/messages/:id" element={<Chat />} />}
        <Route path="/p/:postId" element={<PostDetail />} />
        <Route path="/u/:address" element={<Profile />} />
        <Route path="/nostr/:pubkey" element={<NostrProfile />} />
        <Route path="/tag/:tag" element={<TagPage />} />
        <Route path="/location/:loc" element={<LocationPage />} />
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
