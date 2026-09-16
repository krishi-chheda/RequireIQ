// AUTO-DERIVED from schema.sql at build-authoring time. Edit schema.sql, then run:
//   node scripts/sync-schema.mjs
// Kept as TypeScript so the SQL ships inside the server bundle with no fs read.

export const SCHEMA_SQL = `-- RequireIQ relational schema.
-- Normalised on purpose: evidence, audit and relationships are separate tables
-- so provenance and traceability can be queried, not just displayed.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  key            TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  client         TEXT NOT NULL,
  description    TEXT NOT NULL,
  phase          TEXT NOT NULL,
  baseline_date  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stakeholders (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,
  org         TEXT NOT NULL,
  team        TEXT NOT NULL,
  email       TEXT NOT NULL,
  influence   TEXT NOT NULL CHECK (influence IN ('low','medium','high'))
);
CREATE INDEX IF NOT EXISTS idx_stakeholders_project ON stakeholders(project_id);

CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL,
  filename      TEXT NOT NULL,
  author        TEXT,
  captured_at   TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('uploaded','extracting','analysed','failed')),
  word_count    INTEGER NOT NULL DEFAULT 0,
  content       TEXT NOT NULL,
  uploaded_at   TEXT NOT NULL,
  user_uploaded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ordinal      INTEGER NOT NULL,
  locator      TEXT NOT NULL,
  text         TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_project ON document_chunks(project_id);

CREATE TABLE IF NOT EXISTS requirements (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref                     TEXT NOT NULL,
  statement               TEXT NOT NULL,
  original_statement      TEXT NOT NULL,
  type                    TEXT NOT NULL,
  priority                TEXT NOT NULL CHECK (priority IN ('must','should','could','wont')),
  status                  TEXT NOT NULL CHECK (status IN ('proposed','in_review','needs_clarification','approved','rejected')),
  provenance              TEXT NOT NULL,
  confidence              REAL NOT NULL,
  rationale               TEXT NOT NULL,
  classification_evidence TEXT NOT NULL,
  owner_stakeholder_id    TEXT REFERENCES stakeholders(id) ON DELETE SET NULL,
  acceptance_criteria     TEXT,
  post_baseline           INTEGER NOT NULL DEFAULT 0,
  quality_score           REAL NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  UNIQUE (project_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(project_id, status);

CREATE TABLE IF NOT EXISTS constraints_tbl (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref                  TEXT NOT NULL,
  statement            TEXT NOT NULL,
  category             TEXT NOT NULL CHECK (category IN ('budget','timeline','technical','regulatory','organisational')),
  value                REAL,
  unit                 TEXT,
  owner_stakeholder_id TEXT REFERENCES stakeholders(id) ON DELETE SET NULL,
  provenance           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  UNIQUE (project_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_constraints_project ON constraints_tbl(project_id);

CREATE TABLE IF NOT EXISTS evidence (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_type   TEXT NOT NULL,
  subject_id     TEXT NOT NULL,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id       TEXT REFERENCES document_chunks(id) ON DELETE SET NULL,
  quote          TEXT NOT NULL,
  locator        TEXT NOT NULL,
  start_offset   INTEGER NOT NULL,
  end_offset     INTEGER NOT NULL,
  stakeholder_id TEXT REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_subject ON evidence(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_evidence_document ON evidence(document_id);

CREATE TABLE IF NOT EXISTS conflicts (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref                 TEXT NOT NULL,
  title               TEXT NOT NULL,
  kind                TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status              TEXT NOT NULL CHECK (status IN ('open','accepted','dismissed','needs_clarification','resolved')),
  detector            TEXT NOT NULL,
  explanation         TEXT NOT NULL,
  validation_question TEXT NOT NULL,
  left_type           TEXT NOT NULL,
  left_id             TEXT NOT NULL,
  right_type          TEXT NOT NULL,
  right_id            TEXT NOT NULL,
  confidence          REAL NOT NULL,
  impacted_teams      TEXT NOT NULL,
  resolution_note     TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (project_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_conflicts_project ON conflicts(project_id, status);

CREATE TABLE IF NOT EXISTS ambiguities (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  span           TEXT NOT NULL,
  span_start     INTEGER NOT NULL,
  span_end       INTEGER NOT NULL,
  explanation    TEXT NOT NULL,
  suggestion     TEXT NOT NULL,
  resolved       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ambiguities_req ON ambiguities(requirement_id);
CREATE INDEX IF NOT EXISTS idx_ambiguities_project ON ambiguities(project_id, resolved);

CREATE TABLE IF NOT EXISTS risks (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref            TEXT NOT NULL,
  category       TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  likelihood     TEXT NOT NULL CHECK (likelihood IN ('low','medium','high')),
  mitigation     TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('open','mitigated','accepted')),
  requirement_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
  conflict_id    TEXT REFERENCES conflicts(id) ON DELETE CASCADE,
  provenance     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  UNIQUE (project_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id, status);

CREATE TABLE IF NOT EXISTS relationships (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  rationale   TEXT NOT NULL,
  strength    REAL NOT NULL DEFAULT 0,
  provenance  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_rel_project ON relationships(project_id);

CREATE TABLE IF NOT EXISTS decisions (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref            TEXT NOT NULL,
  title          TEXT NOT NULL,
  detail         TEXT NOT NULL,
  decided_by     TEXT NOT NULL,
  decided_at     TEXT NOT NULL,
  requirement_id TEXT REFERENCES requirements(id) ON DELETE SET NULL,
  conflict_id    TEXT REFERENCES conflicts(id) ON DELETE SET NULL,
  provenance     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  action       TEXT NOT NULL,
  detail       TEXT NOT NULL,
  actor        TEXT NOT NULL,
  actor_kind   TEXT NOT NULL CHECK (actor_kind IN ('ai','human','system')),
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_events(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_events(project_id, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  decision       TEXT NOT NULL CHECK (decision IN ('approved','rejected','needs_clarification','edited')),
  note           TEXT NOT NULL,
  reviewer       TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_req ON reviews(requirement_id);

CREATE TABLE IF NOT EXISTS coverage_gaps (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area        TEXT NOT NULL,
  expectation TEXT NOT NULL,
  reason      TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status      TEXT NOT NULL CHECK (status IN ('open','addressed','dismissed')),
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gaps_project ON coverage_gaps(project_id, status);

-- Single-row bookkeeping so the app can tell whether the demo corpus is loaded
-- and which schema version produced it.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
