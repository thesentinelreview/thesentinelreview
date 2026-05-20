// Gold sensor band. Static this pass — sensor modalities + fusion telemetry
// are not yet wired to the pipeline.
const SENSORS: { name: string; on: boolean }[] = [
  { name: "EO", on: true },
  { name: "IR", on: true },
  { name: "SAR", on: false },
  { name: "SIGINT", on: true },
  { name: "RF", on: true },
  { name: "ELINT", on: false },
  { name: "ACOUSTIC", on: false },
];

export default function SensorStrip() {
  return (
    <div className="flex items-center gap-1.5 border-y border-amber-500/20 bg-amber-500/[0.04] px-3 py-1.5 text-[10px] font-data">
      {SENSORS.map((s) => (
        <span
          key={s.name}
          className={`px-1.5 py-0.5 rounded-sm border tracking-[0.16em] ${
            s.on
              ? "border-teal-400/30 text-teal-300 bg-teal-400/[0.04]"
              : "border-zinc-800 text-zinc-600"
          }`}
        >
          {s.on ? "●" : "○"} {s.name}
        </span>
      ))}
      <span className="ml-1 text-zinc-500">
        FUSION <span className="text-teal-300">0.92</span>
      </span>
      <span className="text-zinc-700">|</span>
      <span className="text-zinc-500">LAT 4.2s</span>
      <span className="text-zinc-700">|</span>
      <span className="text-zinc-500">9 TRK</span>
    </div>
  );
}
