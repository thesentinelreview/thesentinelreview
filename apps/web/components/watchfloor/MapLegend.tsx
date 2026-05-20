import Link from "next/link";

export interface LegendItem {
  label: string;
  dot: string;
  href: string;
  active: boolean;
}

// Bottom-left map legend. Each row toggles its event type via URL params.
export default function MapLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="absolute bottom-3 left-3 z-[420] bg-zinc-950/90 backdrop-blur border border-zinc-800 rounded-sm px-3 py-2 flex flex-col gap-1.5 text-[10px] font-data uppercase tracking-[0.18em]">
      {items.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          className={`flex items-center gap-2 transition-opacity hover:opacity-100 ${
            i.active ? "text-zinc-300" : "text-zinc-600 opacity-60"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${i.active ? i.dot : "border border-current"}`} />
          {i.label}
        </Link>
      ))}
    </div>
  );
}
