"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/queries";
import { RELATIONSHIP_LABEL, REQUIREMENT_TYPE_LABEL, type RelationshipKind } from "@/lib/types";
import { Badge, Eyebrow, Ref, TableFrame, Td, Th, cx } from "./ui";

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
  functional: "var(--color-class-functional)",
  non_functional: "var(--color-class-non-functional)",
  performance: "var(--color-class-performance)",
  security: "var(--color-class-security)",
  compliance: "var(--color-class-compliance)",
  operational: "var(--color-class-operational)",
  technical: "var(--color-class-technical)",
  business: "var(--color-class-business)",
  ux: "var(--color-class-ux)",
  budget: "var(--color-class-budget)",
  timeline: "var(--color-class-timeline)",
  regulatory: "var(--color-class-regulatory)",
  organisational: "var(--color-class-organisational)",
};

const EDGE_STYLE: Record<RelationshipKind, { stroke: string; width: number; dash?: string }> = {
  contradicts: { stroke: "var(--color-critical)", width: 1.6 },
  duplicates: { stroke: "var(--color-rel-duplicates)", width: 1.1, dash: "4 3" },
  depends_on: { stroke: "var(--color-rel-depends)", width: 1.1 },
  supports: { stroke: "var(--color-rel-supports)", width: 0.8 },
  derived_from: { stroke: "var(--color-rel-depends)", width: 1, dash: "2 3" },
  impacts: { stroke: "var(--color-rel-impacts)", width: 0.9 },
};

const SIZE = 760;
const CENTRE = SIZE / 2;

/**
 * Only `Math.cos`/`Math.sin` are allowed to disagree between engines; the four
 * arithmetic operators are exactly specified by IEEE 754, so rounding the trig
 * output once here makes every coordinate derived from it identical on the
 * server and in the browser.
 */
const round2 = (value: number): number => Math.round(value * 100) / 100;

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
        // Rounded to 2dp. Unrounded, Math.cos/sin differ by one ULP between
        // Node and the browser's V8, so the server's coordinate string and the
        // client's disagree in the 13th decimal and React reports a hydration
        // mismatch on every load. Sub-pixel precision buys nothing in a 760
        // unit viewBox.
        placed.set(node.id, {
          x: round2(CENTRE + Math.cos(theta) * radius),
          y: round2(CENTRE + Math.sin(theta) * radius),
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

        {/* Hidden from assistive technology on purpose.

            `role="img"` here used to take the node <g> elements out of the
            accessibility tree while leaving them tabbable, so a keyboard
            reader landed on 82 stops that announced nothing, and the label
            promised a table that did not exist. A radial SVG is not navigable
            by keyboard whatever is done to it, so the picture is now purely
            visual and the relationship table below carries the same data with
            the same links. */}
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" aria-hidden>
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
              const colour = GROUP_COLOUR[node.group] ?? "var(--color-class-unknown)";

              return (
                <g
                  key={node.id}
                  transform={`translate(${position.x} ${position.y})`}
                  opacity={dimmed ? 0.18 : 1}
                  className="cursor-pointer transition-opacity duration-200"
                  onClick={() => setFocus((current) => (current === node.id ? null : node.id))}
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

        <RelationshipList nodes={nodes} edges={visibleEdges} projectId={projectId} />
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

/**
 * The graph as text.
 *
 * Not a fallback - the SVG is `aria-hidden`, so this is the only path to the
 * relationship data for a keyboard or screen-reader user, and it is the same
 * data rather than a summary of it. Collapsed by default because a reader who
 * can see the picture usually wants the picture; open it and every edge is a
 * row with both records linked and the rationale that produced it.
 */
function RelationshipList({
  nodes,
  edges,
  projectId,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  projectId: string;
}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <details className="border-t border-line">
      <summary className="cursor-pointer px-4 py-2.5 text-[11.5px] text-brand-ink hover:text-ink">
        Relationships as a list ({edges.length})
      </summary>
      {edges.length === 0 ? (
        <p className="px-4 pb-4 text-[12px] text-ink-muted">
          No relationships above the overlap threshold with the current edge filter.
        </p>
      ) : (
        <TableFrame minWidth={720} className="border-t border-line">
          <caption className="sr-only">
            Every relationship drawn in the graph above, with the record at each end and the reason the
            link was inferred.
          </caption>
          <thead>
            <tr>
              <Th className="w-28">From</Th>
              <Th className="w-32">Relationship</Th>
              <Th className="w-28">To</Th>
              <Th>Why</Th>
            </tr>
          </thead>
          <tbody>
            {edges.map((edge, index) => {
              const from = byId.get(edge.source);
              const to = byId.get(edge.target);
              if (!from || !to) return null;
              return (
                <tr key={`${edge.source}-${edge.target}-${index}`}>
                  <Td>
                    <NodeLink node={from} projectId={projectId} />
                  </Td>
                  <Td>
                    <Badge tone={edge.kind === "contradicts" ? "critical" : "neutral"}>
                      {RELATIONSHIP_LABEL[edge.kind]}
                    </Badge>
                  </Td>
                  <Td>
                    <NodeLink node={to} projectId={projectId} />
                  </Td>
                  <Td className="text-[11.5px] leading-relaxed">{edge.rationale}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      )}
    </details>
  );
}

/** A requirement links to its record; a constraint has no page of its own. */
function NodeLink({ node, projectId }: { node: GraphNode; projectId: string }) {
  if (node.kind !== "requirement") {
    return (
      <span title={node.label}>
        <Ref>{node.ref}</Ref>
      </span>
    );
  }
  return (
    <Link
      href={`/app/projects/${projectId}/requirements/${node.id}`}
      title={node.label}
      className="text-brand-ink hover:underline"
    >
      <Ref>{node.ref}</Ref>
    </Link>
  );
}
