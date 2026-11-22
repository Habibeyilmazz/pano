import { getI18n } from "@/lib/i18n/server";
import { Logo } from "@/components/ui";
import { LanguageSwitch } from "@/components/auth-forms";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const i = await getI18n();
  const sample = i.m.auth.sample;
  const lanes = sample.who.map((who, n) => ({ who, now: sample.now[n], next: sample.next[n], done: [3, 2, 4][n] }));
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0f2a23] p-10 text-[#e6f2ed] lg:flex">
        <Logo className="text-[#e6f2ed]" />
        <div>
          <p className="max-w-md text-3xl leading-tight font-semibold">{i.m.auth.tagline}</p>
          <div className="mt-10 space-y-2.5" aria-hidden>
            {lanes.map((l) => (
              <div key={l.who} className="grid grid-cols-[6rem_1fr_1fr_2.5rem] items-center gap-2 text-[13px]">
                <span className="truncate text-[#a9c8bc]">{l.who}</span>
                <span className="truncate rounded-md bg-[#56c6a4] px-2.5 py-1.5 font-medium text-[#06241c]">{l.now}</span>
                <span className="truncate rounded-md border border-[#2f5248] px-2.5 py-1.5 text-[#cfe3db]">{l.next}</span>
                <span className="text-center font-semibold text-[#56c6a4] tabular-nums">✓{l.done}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#8fb3a6]">© pano</p>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo className="text-ink lg:invisible" />
          <LanguageSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
