"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  FolderKanban,
  ListChecks,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { Dialog } from "./client";
import { Avatar, Logo } from "./ui";

const ICONS = {
  myWork: ListChecks,
  projects: FolderKanban,
  team: UsersRound,
  dashboard: BarChart3,
  users: Users,
  roles: ShieldCheck,
  audit: ScrollText,
  settings: Settings,
  notifications: Bell,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };
export type ShellProps = {
  main: NavItem[];
  admin: NavItem[];
  projects: { key: string; name: string }[];
  user: { id: string; name: string; workspace: string; role: string };
  unread: number;
  canCreate: boolean;
  children: React.ReactNode;
};

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

function NavLink({ item, path, onNavigate }: { item: NavItem; path: string; onNavigate?: () => void }) {
  const Icon = ICONS[item.icon];
  const active = isActive(path, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className="flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-brand-soft aria-[current=page]:text-ink"
    >
      <Icon size={17} aria-hidden className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavBody({ props, onNavigate }: { props: ShellProps; onNavigate?: () => void }) {
  const path = usePathname();
  const { m } = useI18n();
  return (
    <nav aria-label={m.nav.main} className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {props.main.map((item) => (
        <div key={item.href}>
          <NavLink item={item} path={path} onNavigate={onNavigate} />
          {item.icon === "projects" && props.projects.length > 0 && (
            <ul className="mt-0.5 mb-1 ml-[1.2rem] border-l border-line pl-2">
              {props.projects.map((p) => (
                <li key={p.key}>
                  <Link
                    href={`/projects/${p.key}`}
                    onClick={onNavigate}
                    aria-current={isActive(path, `/projects/${p.key}`) ? "page" : undefined}
                    className="flex min-h-8 items-center gap-2 rounded-md px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink"
                  >
                    <span className="w-9 shrink-0 text-[11px] font-semibold text-ink-3">{p.key}</span>
                    <span className="truncate">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {props.admin.length > 0 && (
        <>
          <p className="mt-5 mb-1 px-2.5 text-xs font-semibold text-ink-3">{m.nav.admin}</p>
          {props.admin.map((item) => (
            <NavLink key={item.href} item={item} path={path} onNavigate={onNavigate} />
          ))}
        </>
      )}
    </nav>
  );
}

function UserBlock({ props }: { props: ShellProps }) {
  const { m } = useI18n();
  return (
    <div className="flex items-center gap-2.5 border-t border-line p-3">
      <Avatar id={props.user.id} name={props.user.name} size={32} title="" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{props.user.name}</p>
        <p className="truncate text-xs text-ink-3">{props.user.role}</p>
      </div>
      <form action={logoutAction}>
        <button className="btn btn-ghost btn-sm px-1.5" aria-label={m.nav.signOut} title={m.nav.signOut}>
          <LogOut size={17} aria-hidden />
        </button>
      </form>
    </div>
  );
}

export function Shell(props: ShellProps) {
  const { m, plural } = useI18n();
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector("dialog[open]") && e.key !== "?") return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (e.key === "c" && props.canCreate) {
        e.preventDefault();
        const onBoard = /^\/projects\/[A-Z0-9]+(\/list)?$/.test(path);
        if (onBoard) window.dispatchEvent(new Event("pano:new-task"));
        else if (props.projects[0]) router.push(`/projects/${props.projects[0].key}?new=1`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, props.canCreate, props.projects, router]);

  const unreadLabel = props.unread ? `${m.nav.notifications}, ${plural(m.nav.unread, props.unread)}` : m.nav.notifications;
  const bell = (
    <Link
      href="/notifications"
      aria-label={unreadLabel}
      aria-current={path === "/notifications" ? "page" : undefined}
      className="relative inline-flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <Bell size={19} aria-hidden />
      {props.unread > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] leading-[18px] font-semibold text-white dark:text-[#2a0d0b]">
          {props.unread > 99 ? "99+" : props.unread}
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {m.nav.skip}
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-14 items-center px-5">
          <Link href="/my-work" aria-label="pano">
            <Logo />
          </Link>
        </div>
        <p className="truncate px-5 pb-2 text-xs font-medium text-ink-3">{props.user.workspace}</p>
        <NavBody props={props} />
        <UserBlock props={props} />
      </aside>

      <Dialog open={drawer} onClose={() => setDrawer(false)} title={props.user.workspace}>
        <div className="-mx-3 -mb-5 flex max-h-[70dvh] flex-col">
          <NavBody props={props} onNavigate={() => setDrawer(false)} />
          <UserBlock props={props} />
        </div>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur md:px-6">
          <button className="btn btn-ghost px-2 md:hidden" onClick={() => setDrawer(true)} aria-label={m.nav.menu}>
            <Menu size={20} aria-hidden />
          </button>
          <form action="/search" role="search" className="relative max-w-md flex-1">
            <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
            <label htmlFor="global-search" className="sr-only">
              {m.nav.search}
            </label>
            <input id="global-search" name="q" type="search" placeholder={m.nav.searchPlaceholder} className="input pr-8 pl-8" autoComplete="off" />
            <kbd className="kbd pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 sm:inline-flex" aria-hidden>
              /
            </kbd>
          </form>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn btn-ghost hidden px-2 text-ink-2 sm:inline-flex" onClick={() => setHelp(true)} aria-label={m.nav.shortcuts} title={m.nav.shortcuts}>
              <kbd className="kbd">?</kbd>
            </button>
            {bell}
            <Link href="/settings" aria-label={m.nav.settings} className="ml-1 rounded-full">
              <Avatar id={props.user.id} name={props.user.name} size={30} title="" />
            </Link>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">
          {props.children}
        </main>
      </div>

      <nav aria-label={m.nav.main} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {props.main.slice(0, 3).map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(path, item.href) ? "page" : undefined}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-3 aria-[current=page]:text-brand"
            >
              <Icon size={20} aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button onClick={() => setDrawer(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-3">
          <Menu size={20} aria-hidden />
          {m.nav.menu}
        </button>
      </nav>

      <Dialog open={help} onClose={() => setHelp(false)} title={m.shortcuts.title}>
        <dl className="space-y-2.5 text-sm">
          {(
            [
              ["c", m.shortcuts.newTask],
              ["/", m.shortcuts.search],
              ["?", m.shortcuts.help],
              ["Esc", m.shortcuts.close],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <dt className="text-ink-2">{label}</dt>
              <dd>
                <kbd className="kbd">{k}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}
