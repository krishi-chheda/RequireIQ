import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  getProject,
  listConstraints,
  listProjectAmbiguities,
  listRequirements,
  listStakeholders,
  type RequirementFilters,
} from "@/lib/queries";
import { z } from "@/lib/validate";
import {
  PRIORITY_LABEL,
  REQUIREMENT_TYPES,
  REQUIREMENT_TYPE_LABEL,
  type Priority,
  type RequirementType,
  type ReviewStatus,
} from "@/lib/types";
import { RegisterFilters, type FilterGroup } from "@/components/filters";
import {
  Badge,
  Card,
  CardHeader,
  Confidence,
  EmptyState,
  Eyebrow,
  PageHeader,
  ProvenanceTag,
  Ref,
  StatusBadge,
  TableFrame,
  Td,
  Th,
} from "@/components/ui";

export const metadata: Metadata = { title: "Requirements register" };

const VIEWS = ["findings", "unowned", "no-acceptance", "post-baseline", "constraints"] as const;
const STATUSES: ReviewStatus[] = ["proposed", "in_review", "needs_clarification", "approved", "rejected"];
const PRIORITIES: Priority[] = ["must", "should", "could", "wont"];

export default async function RequirementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = getProject(projectId);
  if (!project) notFound();

  const view = z.optionalOneOf(query.view, VIEWS);
  const type = z.optionalOneOf(query.type, REQUIREMENT_TYPES) as RequirementType | undefined;
  const status = z.optionalOneOf(query.status, STATUSES) as ReviewStatus | undefined;
  const priority = z.optionalOneOf(query.priority, PRIORITIES) as Priority | undefined;
  const search = z.search(query.q);

  const filters: RequirementFilters = {
    type,
    status,
    priority,
    search,
    hasFindings: view === "findings" || undefined,
    unowned: view === "unowned" || undefined,
    postBaseline: view === "post-baseline" || undefined,
  };

  const all = listRequirements(projectId);
  let rows = listRequirements(projectId, filters);
  if (view === "no-acceptance") rows = rows.filter((r) => !r.acceptanceCriteria && r.priority === "must");

  const stakeholders = new Map(listStakeholders(projectId).map((s) => [s.id, s]));
  const findingCounts = listProjectAmbiguities(projectId)
    .filter((a) => !a.resolved)
    .reduce<Map<string, number>>((map, a) => map.set(a.requirementId, (map.get(a.requirementId) ?? 0) + 1), new Map());

  const base = `/app/projects/${projectId}`;

  const typeCounts = new Map<string, number>();
  for (const requirement of all) typeCounts.set(requirement.type, (typeCounts.get(requirement.type) ?? 0) + 1);

  const filterGroups: FilterGroup[] = [
    {
      param: "view",
      label: "Needs attention",
      options: [
        { value: "findings", label: "Has quality findings", count: findingCounts.size },
        { value: "no-acceptance", label: "Binding, no test", count: all.filter((r) => r.priority === "must" && !r.acceptanceCriteria).length },
        { value: "unowned", label: "No owner", count: all.filter((r) => !r.ownerStakeholderId).length },
        { value: "post-baseline", label: "Post-baseline", count: all.filter((r) => r.postBaseline).length },
      ],
    },
    {
      param: "type",
      label: "Type",
      options: REQUIREMENT_TYPES.filter((t) => typeCounts.has(t)).map((t) => ({
        value: t,
        label: REQUIREMENT_TYPE_LABEL[t],
        count: typeCounts.get(t),
      })),
    },
    {
      param: "status",
      label: "Review status",
      options: STATUSES.filter((s) => all.some((r) => r.status === s)).map((s) => ({
        value: s,
        label: s.replace(/_/g, " "),
        count: all.filter((r) => r.status === s).length,
      })),
    },
    {
      param: "priority",
      label: "Priority",
      options: PRIORITIES.filter((p) => all.some((r) => r.priority === p)).map((p) => ({
        value: p,
        label: PRIORITY_LABEL[p],
        count: all.filter((r) => r.priority === p).length,
      })),
    },
  ];

  if (view === "constraints") {
    return <ConstraintsView projectId={projectId} base={base} />;
  }

  return (
    <main id="main" className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Register"
          title="Requirements"
          description="Every statement below was lifted verbatim from a source document. None is authoritative until a person has approved it, and every row records where it came from."
          actions={
            <Link
              href={`${base}/requirements?view=constraints`}
              className="inline-flex items-center gap-1.5 rounded-sm border border-edge bg-overlay px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-hover"
            >
              View constraints
            </Link>
          }
        />

        <div className="grid gap-5 lg:grid-cols-[212px_1fr]">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card className="p-4">
              <Suspense fallback={<div className="h-64 animate-pulse rounded-sm bg-overlay" />}>
                <RegisterFilters groups={filterGroups} total={all.length} shown={rows.length} />
              </Suspense>
            </Card>
          </aside>

          <Card className="min-w-0">
            {rows.length === 0 ? (
              <EmptyState
                title="No requirements match these filters"
                description="Clear a filter or broaden the search. The register holds every statement extracted from the ingested documents; the filters only narrow what is shown."
              />
            ) : (
              <TableFrame>
                <thead>
                  <tr>
                    <Th className="w-[84px]">Ref</Th>
                    <Th className="min-w-[320px]">Statement</Th>
                    <Th className="w-[112px]">Type</Th>
                    <Th className="w-[96px]">Priority</Th>
                    <Th className="w-[128px]">Owner</Th>
                    <Th className="w-[108px]">Confidence</Th>
                    <Th className="w-[116px]">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((requirement) => {
                    const owner = requirement.ownerStakeholderId
                      ? stakeholders.get(requirement.ownerStakeholderId)
                      : null;
                    const findings = findingCounts.get(requirement.id) ?? 0;

                    return (
                      <tr key={requirement.id} className="group transition-colors hover:bg-raised">
                        <Td>
                          <Link href={`${base}/requirements/${requirement.id}`} className="block">
                            <Ref className="group-hover:text-brand-ink">{requirement.ref}</Ref>
                          </Link>
                        </Td>
                        <Td>
                          <Link href={`${base}/requirements/${requirement.id}`} className="block">
                            <p className="text-[12.5px] leading-snug text-ink">{requirement.statement}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <ProvenanceTag provenance={requirement.provenance} />
                              {findings > 0 ? (
                                <Badge tone="high">
                                  {findings} finding{findings === 1 ? "" : "s"}
                                </Badge>
                              ) : null}
                              {requirement.priority === "must" && !requirement.acceptanceCriteria ? (
                                <Badge tone="medium">No acceptance criteria</Badge>
                              ) : null}
                              {requirement.postBaseline ? <Badge tone="medium">Post-baseline</Badge> : null}
                            </div>
                          </Link>
                        </Td>
                        <Td>
                          <Badge>{REQUIREMENT_TYPE_LABEL[requirement.type]}</Badge>
                        </Td>
                        <Td>
                          <span className="text-[12px]">{PRIORITY_LABEL[requirement.priority]}</span>
                        </Td>
                        <Td>
                          {owner ? (
                            <span className="text-[12px] text-ink" title={`${owner.role}, ${owner.team}`}>
                              {owner.name}
                            </span>
                          ) : (
                            <Badge tone="high">Unassigned</Badge>
                          )}
                        </Td>
                        <Td>
                          <Confidence value={requirement.confidence} />
                        </Td>
                        <Td>
                          <StatusBadge status={requirement.status} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableFrame>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

/** Constraints are a small, separate table: hard limits, not capabilities. */
function ConstraintsView({ projectId, base }: { projectId: string; base: string }) {
  const constraints = listConstraints(projectId);
  const stakeholders = new Map(listStakeholders(projectId).map((s) => [s.id, s]));

  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <div className="enter space-y-6">
        <PageHeader
          eyebrow="Register"
          title="Constraints"
          description="Hard limits the requirements must respect: budget envelopes, committed dates, platform mandates and regulatory obligations. A constraint is not negotiable by the delivery team."
          actions={
            <Link
              href={`${base}/requirements`}
              className="inline-flex items-center gap-1.5 rounded-sm border border-edge bg-overlay px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-hover"
            >
              Back to requirements
            </Link>
          }
        />

        <Card>
          <CardHeader
            title={`${constraints.length} constraints`}
            description="Parsed values are used directly by the conflict detectors."
          />
          <ul className="divide-y divide-line">
            {constraints.map((constraint) => {
              const owner = constraint.ownerStakeholderId ? stakeholders.get(constraint.ownerStakeholderId) : null;
              return (
                <li key={constraint.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Ref>{constraint.ref}</Ref>
                    <Badge tone="brand">{constraint.category}</Badge>
                    <ProvenanceTag provenance={constraint.provenance} />
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink">{constraint.statement}</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-faint">
                    {constraint.value !== null ? (
                      <span>
                        Parsed value:{" "}
                        <span data-numeric className="text-ink-muted">
                          {constraint.unit === "currency"
                            ? `$${constraint.value.toLocaleString("en-US")}`
                            : constraint.unit === "epoch-ms"
                              ? new Date(constraint.value).toLocaleDateString("en-GB", { timeZone: "UTC" })
                              : `${constraint.value.toLocaleString("en-US")} ${constraint.unit ?? ""}`}
                        </span>
                      </span>
                    ) : (
                      <span>No numeric value parsed - compared textually only.</span>
                    )}
                    {owner ? <span>Raised by {owner.name}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <Eyebrow>Why constraints are separate</Eyebrow>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">
            A requirement describes something the system must do; a constraint describes a boundary the
            solution must fit inside. Separating them matters for conflict detection: the interesting
            contradictions in an engagement are almost always a requirement pushing against a constraint
            somebody else set, in a document the requirement&apos;s author never read.
          </p>
        </Card>
      </div>
    </main>
  );
}
