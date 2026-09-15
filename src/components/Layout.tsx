import { type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Home, Compass, PlusSquare, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/store/auth";
import { CreatePostProvider, useCreatePost } from "./CreatePost";
import Logo from "./Logo";
import Avatar from "./Avatar";
import { cn } from "@/lib/utils";
import { shortAddress } from "@/lib/format";
import { useMyProfile } from "@/hooks/useProfile";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <CreatePostProvider>
      <div className="min-h-screen bg-ink">
        <div className="mx-auto flex max-w-6xl">
          <DesktopSidebar />
          <main className="min-h-screen min-w-0 flex-1 border-x border-ink-border/60 pb-[calc(var(--bottom-nav-h)+1rem)] md:pb-8">
            <MobileTopBar />
            <div className="mx-auto w-full max-w-[620px] px-0 sm:px-4">
              {children}
            </div>
          </main>
          <RightRail />
        </div>
        <MobileBottomNav />
      </div>
    </CreatePostProvider>
  );
}

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/explore", label: "Explore", icon: Compass, end: false },
];

function DesktopSidebar() {
  const { address } = useAuth();
  const { open } = useCreatePost();
  const profile = useMyProfile();

  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col gap-1 p-4 md:flex">
      <div className="mb-4 px-2 pt-2">
        <Logo size={32} withWordmark />
      </div>
      {navItems.map((item) => (
        <SideLink key={item.to} {...item} />
      ))}
      <button
        onClick={open}
        className="mt-1 flex items-center gap-4 rounded-xl px-3 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-white/5"
      >
        <PlusSquare className="h-6 w-6" />
        Create
      </button>
      <SideLink
        to={`/u/${address}`}
        label="Profile"
        end={false}
        renderIcon={() => (
          <Avatar
            refUri={profile?.avatarRef}
            seed={address}
            name={profile?.name}
            size={26}
          />
        )}
      />
      <SideLink to="/settings" label="Settings" icon={Settings} end={false} />
    </aside>
  );
}

function SideLink({
  to,
  label,
  icon: Icon,
  end,
  renderIcon,
}: {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  end: boolean;
  renderIcon?: () => ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-4 rounded-xl px-3 py-2.5 text-[15px] transition-colors hover:bg-white/5",
          isActive ? "font-bold text-white" : "font-medium text-ink-muted hover:text-white",
        )
      }
    >
      {renderIcon ? renderIcon() : Icon ? <Icon className="h-6 w-6" /> : null}
      {label}
    </NavLink>
  );
}

function RightRail() {
  const { address, balance, lock } = useAuth();
  const profile = useMyProfile();
  return (
    <aside className="sticky top-0 hidden h-screen w-[300px] shrink-0 flex-col gap-4 p-6 lg:flex">
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <Avatar refUri={profile?.avatarRef} seed={address} name={profile?.name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {profile?.name || shortAddress(address)}
            </div>
            <div className="truncate text-xs text-ink-muted">
              {shortAddress(address, 10, 6)}
            </div>
          </div>
          <button
            className="btn-ghost h-8 px-2"
            onClick={lock}
            title="Lock"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-soft px-3 py-2.5">
          <span className="text-xs text-ink-muted">Balance</span>
          <span className="text-sm font-semibold">
            {balance.toLocaleString(undefined, { maximumFractionDigits: 3 })}{" "}
            <span className="text-rouge-400">XRGE</span>
          </span>
        </div>
      </div>
      <p className="px-2 text-xs leading-relaxed text-ink-muted">
        Rougee-gram runs on RougeChain. Your posts are signed with your key and
        stored on-chain — no company can shadowban or delete your account.
      </p>
    </aside>
  );
}

function MobileTopBar() {
  const { open } = useCreatePost();
  return (
    <header className="sticky top-0 z-30 flex h-[var(--top-bar-h)] items-center justify-between border-b border-ink-border bg-ink/80 px-4 backdrop-blur md:hidden">
      <Logo size={28} withWordmark />
      <button onClick={open} className="btn-ghost h-9 w-9 p-0" aria-label="Create post">
        <PlusSquare className="h-6 w-6" />
      </button>
    </header>
  );
}

function MobileBottomNav() {
  const { address } = useAuth();
  const { open } = useCreatePost();
  const navigate = useNavigate();
  const profile = useMyProfile();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-ink-border bg-ink/90 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <BottomLink to="/" end icon={Home} label="Home" />
      <BottomLink to="/explore" icon={Compass} label="Explore" />
      <button
        onClick={open}
        className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-4 py-1 text-ink-muted"
        aria-label="Create"
      >
        <PlusSquare className="h-6 w-6" />
      </button>
      <BottomLink to="/settings" icon={Settings} label="Settings" />
      <button
        onClick={() => navigate(`/u/${address}`)}
        className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-4 py-1"
        aria-label="Profile"
      >
        <Avatar refUri={profile?.avatarRef} seed={address} name={profile?.name} size={26} />
      </button>
    </nav>
  );
}

function BottomLink({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-4 py-1",
          isActive ? "text-white" : "text-ink-muted",
        )
      }
      aria-label={label}
    >
      <Icon className="h-6 w-6" />
    </NavLink>
  );
}
