import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth";
import Layout from "./components/Layout";
import Onboarding from "./pages/Onboarding";
import Unlock from "./pages/Unlock";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Profile from "./pages/Profile";
import PostDetail from "./pages/PostDetail";
import Settings from "./pages/Settings";
import Splash from "./components/Splash";

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
        <Route path="/p/:postId" element={<PostDetail />} />
        <Route path="/u/:address" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
