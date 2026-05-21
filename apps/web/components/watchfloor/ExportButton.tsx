"use client";

export default function ExportButton({
  date,
  headline,
  paragraphs,
}: {
  date: string;
  headline: string;
  paragraphs: string[];
}) {
  function handleExport() {
    const lines = [
      `SENTINEL INTELLIGENCE BRIEFING`,
      `${date}`,
      ``,
      headline,
      ``,
      ...paragraphs,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentinel-brief-${date.replace(/\s/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="px-2 py-1 text-[10px] rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-300 tracking-wider uppercase font-data hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
    >
      Export
    </button>
  );
}
