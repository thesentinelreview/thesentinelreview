"use client";

import { useState } from "react";

const INITIAL_SENSORS: { name: string; on: boolean }[] = [
  { name: "EO",       on: true  },
  { name: "IR",       on: true  },
  { name: "SAR",      on: false },
  { name: "SIGINT",   on: true  },
  { name: "RF",       on: true  },
  { name: "ELINT",    on: false },
  { name: "ACOUSTIC", on: false },
];

export default function SensorStrip() {
  const [sensors, setSensors] = useState(INITIAL_SENSORS);

  function toggle(name: string) {
    setSensors((prev) =>
      prev.map((s) => (s.name === name ? { ...s, on: !s.on } : s))
    );
  }

  const activeCount = sensors.filter((s) => s.on).length;

  return (
    <div className="overflow-x-auto border-y border-amber-500/20 bg-amber-500/[0.04]">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-data min-w-max">
        {sensors.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => toggle(s.name)}
            className={`px-1.5 py-0.5 rounded-sm border tracking-[0.16em] cursor-pointer transition-colors ${
              s.on
                ? "border-teal-400/30 text-teal-300 bg-teal-400/[0.04] hover:bg-teal-400/[0.1]"
                : "border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700"
            }`}
          >
            {s.on ? "●" : "○"} {s.name}
          </button>
        ))}
        <span className="ml-2 text-zinc-500">
          FUSION <span className="text-teal-300">0.92</span>
        </span>
        <span className="text-zinc-700">|</span>
        <span className="text-zinc-500">LAT 4.2s</span>
        <span className="text-zinc-700">|</span>
        <span className="text-zinc-500">{activeCount} TRK</span>
      </div>
    </div>
  );
}
