"use client";

import { useEffect, useRef, useState } from "react";

interface GraphNode {
  id: string;
  label: string;
  type: "server" | "workstation" | "network" | "cloud" | "unknown";
  status: "healthy" | "warning" | "critical" | "offline";
  ip: string;
  alertCount: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  strength: number;
}

interface Tooltip {
  x: number;
  y: number;
  node: GraphNode;
}

const STATUS_COLORS: Record<GraphNode["status"], string> = {
  critical: "#ef4444",
  warning:  "#f59e0b",
  healthy:  "#22c55e",
  offline:  "#6b7280",
};

export default function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let simulation: any;

    async function init() {
      const [d3, res] = await Promise.all([
        import("d3"),
        fetch("/api/graph"),
      ]);

      if (cancelled) return;

      if (!res.ok) { setError(true); setLoading(false); return; }
      const { nodes, links }: { nodes: GraphNode[]; links: GraphLink[] } = await res.json();
      if (cancelled) return;
      setLoading(false);

      const svg = d3.select(svgRef.current!);
      const el = svgRef.current!;
      const W = el.clientWidth || 800;
      const H = el.clientHeight || 500;

      svg.selectAll("*").remove();

      const g = svg.append("g");

      svg.call(
        d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.2, 4])
          .on("zoom", (event) => g.attr("transform", event.transform))
      );

      simulation = d3.forceSimulation<GraphNode>(nodes)
        .force("link", d3.forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(80)
          .strength((d) => Math.min((d.strength as number) * 0.15, 0.6))
        )
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(W / 2, H / 2))
        .force("collision", d3.forceCollide(24));

      const link = g.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", "#1a2340")
        .attr("stroke-opacity", 0.8)
        .attr("stroke-width", (d) => Math.max(1, (d.strength as number) * 0.8));

      const nodeGroup = g.append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("cursor", "pointer")
        .call(
          d3.drag<SVGGElement, GraphNode>()
            .on("start", (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on("drag", (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on("end", (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            })
        )
        .on("mouseenter", (event, d) => {
          const rect = el.getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left + 10, y: event.clientY - rect.top - 10, node: d });
        })
        .on("mouseleave", () => setTooltip(null));

      nodeGroup.each(function (d) {
        const color = STATUS_COLORS[d.status];
        const sel = d3.select(this);
        if (d.type === "server") {
          sel.append("circle").attr("r", 10).attr("fill", color).attr("fill-opacity", 0.85).attr("stroke", color).attr("stroke-width", 1.5).attr("stroke-opacity", 0.5);
        } else if (d.type === "workstation") {
          sel.append("rect").attr("x", -9).attr("y", -9).attr("width", 18).attr("height", 18).attr("rx", 2).attr("fill", color).attr("fill-opacity", 0.85).attr("stroke", color).attr("stroke-width", 1.5).attr("stroke-opacity", 0.5);
        } else if (d.type === "network") {
          sel.append("polygon").attr("points", "0,-11 10,5.5 -10,5.5").attr("fill", color).attr("fill-opacity", 0.85).attr("stroke", color).attr("stroke-width", 1.5).attr("stroke-opacity", 0.5);
        } else if (d.type === "cloud") {
          sel.append("polygon").attr("points", "0,-10 7,0 4,10 -4,10 -7,0").attr("fill", color).attr("fill-opacity", 0.85).attr("stroke", color).attr("stroke-width", 1.5).attr("stroke-opacity", 0.5);
        } else {
          sel.append("circle").attr("r", 8).attr("fill", color).attr("fill-opacity", 0.7).attr("stroke", color).attr("stroke-width", 1);
        }

        if (d.alertCount > 0) {
          sel.append("circle").attr("cx", 8).attr("cy", -8).attr("r", 5).attr("fill", "#ef4444");
          sel.append("text").attr("x", 8).attr("y", -4).attr("text-anchor", "middle").attr("font-size", "6").attr("fill", "white").attr("font-family", "monospace").text(d.alertCount > 9 ? "9+" : String(d.alertCount));
        }

        sel.append("text")
          .attr("y", 20)
          .attr("text-anchor", "middle")
          .attr("font-size", "8")
          .attr("font-family", "monospace")
          .attr("fill", "#607090")
          .text(d.label.length > 14 ? d.label.slice(0, 13) + "…" : d.label);
      });

      simulation.on("tick", () => {
        link
          .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
          .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
          .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
          .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

        nodeGroup.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });
    }

    init().catch(() => { setError(true); setLoading(false); });

    return () => {
      cancelled = true;
      simulation?.stop();
    };
  }, []);

  return (
    <div className="relative w-full h-full" style={{ background: "#030508", minHeight: 400 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-xs" style={{ color: "#607090" }}>BUILDING TOPOLOGY...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-xs" style={{ color: "#ef4444" }}>GRAPH FEED ERROR</span>
        </div>
      )}
      <svg ref={svgRef} className="w-full h-full" />
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 border px-2.5 py-2 font-mono text-[10px]"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            background: "#0a0e1a",
            borderColor: "#1a2340",
            color: "#c8d8e8",
            minWidth: 160,
          }}
        >
          <div style={{ color: STATUS_COLORS[tooltip.node.status] }} className="font-semibold mb-1">
            {tooltip.node.label}
          </div>
          <div style={{ color: "#607090" }}>IP: <span style={{ color: "#00d4ff" }}>{tooltip.node.ip || "—"}</span></div>
          <div style={{ color: "#607090" }}>TYPE: <span style={{ color: "#c8d8e8" }}>{tooltip.node.type.toUpperCase()}</span></div>
          <div style={{ color: "#607090" }}>STATUS: <span style={{ color: STATUS_COLORS[tooltip.node.status] }}>{tooltip.node.status.toUpperCase()}</span></div>
          {tooltip.node.alertCount > 0 && (
            <div style={{ color: "#ef4444" }}>ALERTS: {tooltip.node.alertCount}</div>
          )}
        </div>
      )}
    </div>
  );
}
