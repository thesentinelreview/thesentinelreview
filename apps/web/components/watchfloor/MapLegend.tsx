// Bottom-left map legend overlay. Static — three marker kinds.
const ITEMS = [
  { label: "Strike", dot: "bg-red-500" },
  { label: "Contact", dot: "bg-amber-500" },
  { label: "Track", dot: "bg-teal-300" },
];

export default function MapLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-[420] bg-zinc-950/90 backdrop-blur border border-zinc-800 rounded-sm px-3 py-2 flex flex-col gap-1.5 text-[10px] font-data uppercase tracking-[0.18em]">
      {ITEMS.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-zinc-300">
          <span className={`w-2 h-2 rounded-full ${i.dot}`} />
          {i.label}
        </div>
      ))}
    </div>
  );
}
