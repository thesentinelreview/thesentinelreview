import Link from "next/link";

const MODULES = [
  { label: "Grants",       href: "/admin/grants" },
  { label: "Founding",     href: "/admin/founding" },
  { label: "Sources",      href: "/admin/sources" },
  { label: "Review Queue", href: "/admin/review-queue" },
  { label: "Tie-out",      href: "/admin/tieout" },
];

/** Small nav row shared by the admin modules. */
export default function AdminNav({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-xs font-data">
      {MODULES.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          className={`px-2.5 py-1 rounded border ${
            m.href === active
              ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
              : "text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500"
          }`}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}
