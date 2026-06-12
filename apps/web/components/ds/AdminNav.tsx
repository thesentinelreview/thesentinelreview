import FilterChip from "./FilterChip";

const MODULES = [
  { label: "Grants",       href: "/admin/grants" },
  { label: "Founding",     href: "/admin/founding" },
  { label: "Sources",      href: "/admin/sources" },
  { label: "Review Queue", href: "/admin/review-queue" },
  { label: "Tie-out",      href: "/admin/tieout" },
];

/** Small nav row shared by the admin modules — FilterChip in href mode. */
export default function AdminNav({ active }: { active: string }) {
  return (
    <nav aria-label="Admin modules" className="flex flex-wrap items-center gap-2">
      {MODULES.map((m) => (
        <FilterChip key={m.href} href={m.href} active={m.href === active}>
          {m.label}
        </FilterChip>
      ))}
    </nav>
  );
}
