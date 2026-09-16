"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/queries";
import { RELATIONSHIP_LABEL, REQUIREMENT_TYPE_LABEL, type RelationshipKind } from "@/lib/types";
import { Badge, Eyebrow, Ref, cx } from "./ui";

/**
 * The requirement relationship graph.
 *
 * Deterministic radial layout rather than a force simulation, for three
 * reasons: the same register always draws the same picture, so a screenshot in
 * a status pack still matches the tool next week; there is no animation frame
 * loop burning CPU behind a page nobody is looking at; and the angular position
 * carries meaning - nodes are grouped by class, so a cluster is a category
 * rather than an accident of physics.
 *
 * Contradiction edges are drawn on top, in the severity colour, because they
 * are the only edges that represent a problem.
 */

const GROUP_COLOUR: Record<string, string> = {
  functional: "#6f93f5",
  non_functional: "#8b95a6",
  performance: "#f08c3a",
  security: "#f2555a",
  compliance: "#a98bf0",
  operational: "#35b87d",
  technical: "#4bb3c9",
  business: "#d9b02c",
  ux: "#e07ab8",
  budget: "#d9b02c",
  timeline: "#f08c3a",
  regulatory: "#a98bf0",
  organisational: "#8b95a6",
};

const EDGE_STYLE: Record<RelationshipKind, { stroke: string; width: number; dash?: string }> = {
  contradicts: { stroke: "var(--color-critical)", width: 1.6 },
  duplicates: { stroke: "#a98bf0", width: 1.1, dash: "4 3" },
  depends_on: { stroke: "#6f93f5", width: 1.1 },
  supports: { stroke: "#3a414d", width: 0.8 },
  derived_from: { stroke: "#6f93f5", width: 1, dash: "2 3" },
  impacts: { stroke: "#8b95a6", width: 0.9 },
};

const SIZE = 760;
const CENTRE = SIZE / 2;

export function RequirementGraph({
  nodes,
  edges,
  projectId,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  projectId: string;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<RelationshipKind | null>(null);

  const visibleEdges = useMemo(
    () => (kindFilter ? edges.filter((e) => e.kind === kindFilter) : edges),
    [edges, kindFilter],
  );

  /**
   * Layout: group nodes by class, give each group an arc of the circle
   * proportional to its size, then place the group's nodes along two rings so
   * a large group does not crowd its own arc.
   */
  const positions = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    for (const node of nodes) {
      groups.set(node.group, [...(groups.get(node.group) ?? []), node]);
    }
    const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

    const placed = new Map<string, { x: number; y: number }>();
    let angle = -Math.PI / 2;

    for (const [, members] of ordered) {
      const arc = (members.length / nodes.length) * Math.PI * 2;
      members.forEach((node, index) => {
        const withinArc = members.length === 1 ? arc / 2 : (index / (members.length - 1)) * arc * 0.92;
        const theta = angle + withinArc;
        // Alternate rings so dense groups stay legible.
        const radius = index % 2 === 0 ? 268 : 212;
        placed.set(node.id, {
          x: CENTRE + Math.cos(theta) * radius,
          y: CENTRE + Math.sin(theta) * radius,
        });
      });
      angle += arc;
    }
    return placed;
  }, [nodes]);

  const neighbours = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const edge of visibleEdges) {
      if (edge.source === focus) set.add(edge.target);
      if (edge.target === focus) set.add(edge.source);
    }
    return set;
  }, [focus, visibleEdges]);

  const focused = focus ? nodes.find((n) => n.id === focus) : null;
  const focusedEdges = focus
    ? visibleEdges.filter((e) => e.source === focus || e.target === focus)
    : [];

  const kinds = [...new Set(edges.map((e) => e.kind))];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <Eyebrow>Edge type</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={kindFilter === kind}
                onClick={() => setKindFilter((current) => (current === kind ? null : kind))}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5 text-[11px] transition-colors",
                  kindFilter === kind
                    ? "border-brand/50 bg-brand-soft text-brand-ink"
                    : "border-line text-ink-muted hover:border-edge hover:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className="h-px w-3"
                  style={{ background: EDGE_STYLE[kind].stroke }}
                />
                {RELATIONSHIP_LABEL[kind]}
                <span data-numeric className="text-ink-faint">
                  {edges.filter((e) => e.kind === kind).length}
                </span>
              </button>
            ))}
          </div>
          {focus ? (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="ml-auto text-[11.5px] text-brand-ink hover:text-ink"
            >
              Clear focus
            </button>
          ) : null}
        </div>

        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Relationship graph: ${nodes.length} records connected by ${visibleEdges.length} edges. The table beside this graph lists the same relationships.`}
        >
          <g>
            {/* Non-contradiction edges first, so contradictions draw on top. */}
            {[...visibleEdges]
              .sort((a, b) => (a.kind === "contradicts" ? 1 : 0) - (b.kind === "contradicts" ? 1 : 0))
              .map((edge, index) => {
                const from = positions.get(edge.source);
                const to = positions.get(edge.target);
                if (!from || !to) return null;
                const style = EDGE_STYLE[edge.kind];
                const dimmed = neighbours && !(neighbours.has(edge.source) && neighbours.has(edge.target));

                // Quadratic curve bowed toward the centre: keeps long chords
                // from cutting straight across and hiding nodes underneath.
                const mx = (from.x + to.x) / 2;
                const my = (from.y + to.y) / 2;
                const cx = mx + (CENTRE - mx) * 0.38;
                const cy = my + (CENTRE - my) * 0.38;

                return (
                  <path
                    key={`${edge.source}-${edge.target}-${index}`}
                    d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={style.width}
                    strokeDasharray={style.dash}
                    opacity={dimmed ? 0.07 : edge.kind === "contradicts" ? 0.85 : 0.4}
                    className="transition-opacity duration-200"
                  />
                );
              })}
          </g>

          <g>
            {nodes.map((node) => {
              const position = positions.get(node.id);
              if (!position) return null;
              const dimmed = neighbours && !neighbours.has(node.id);
              const radius = Math.min(11, 4.5 + node.weight * 0.7);
              const colour = GROUP_COLOUR[node.group] ?? "#8b95a6";

              return (
                <g
                  key={node.id}
                  transform={`translate(${position.x} ${position.y})`}
                  opacity={dimmed ? 0.18 : 1}
                  className="cursor-pointer transition-opacity duration-200"
                  onClick={() => setFocus((current) => (current === node.id ? null : node.id))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setFocus((current) => (current === node.id ? null : node.id));
                    }
                  }}
                  aria-label={`${node.ref}: ${node.label}`}
                >
                  <circle
                    r={radius}
                    fill={node.kind === "constraint" ? "var(--color-canvas)" : colour}
                    stroke={colour}
                    strokeWidth={node.kind === "constraint" ? 2 : 1}
                    fillOpacity={node.kind === "constraint" ? 1 : 0.85}
                  />
                  {focus === node.id ? (
                    <circle r={radius + 5} fill="none" stroke={colour} strokeWidth="1" opacity="0.5" />
                  ) : null}
                  <text
                    y={radius + 11}
                    textAnchor="middle"
                    className="pointer-events-none fill-[var(--color-ink-faint)] font-mono text-[9px]"
                  >
                    {node.ref}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 text-[11px] text-ink-faint">
          <span>Filled circle: requirement</span>
          <span>Hollow circle: constraint</span>
          <span>Size: number of connections</span>
          <span>Colour: class</span>
        </div>
      </div>

      <aside className="space-y-4">
        {focused ? (
          <div className="rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <Ref className="text-brand-ink">{focused.ref}</Ref>
                <Badge>{REQUIREMENT_TYPE_LABEL[focused.group as never] ?? focused.group}</Badge>
              </div>
              <p className="mt-2 text-[12.5px] leading-snug text-ink">{focused.label}</p>
              {focused.kind === "requirement" ? (
                <Link
                  href={`/app/projects/${projectId}/requirements/${focused.id}`}
                  className="mt-2 inline-block text-[11.5px] text-brand-ink hover:underline"
                >
                  Open record
                </Link>
              ) : null}
            </div>
            <ul className="divide-y divide-line">
              {focusedEdges.map((edge, index) => {
                const otherId = edge.source === focused.id ? edge.target : edge.source;
                const other = nodes.find((n) => n.id === otherId);
                if (!other) return null;
                return (
                  <li key={`${otherId}-${index}`} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={edge.kind === "contradicts" ? "critical" : "neutral"}>
                        {RELATIONSHIP_LABEL[edge.kind]}
                      </Badge>
                      <Ref>{other.ref}</Ref>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-ink-muted">{other.label}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{edge.rationale}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface px-4 py-5">
            <Eyebrow>Select a node</Eyebrow>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              Click any record to see what it connects to and why. Every edge carries the shared terms that
              produced it, so an inferred link can be disagreed with rather than taken on trust.
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
              Edges below the overlap threshold are not drawn at all. A graph that connects everything to
              everything tells a reviewer nothing.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
