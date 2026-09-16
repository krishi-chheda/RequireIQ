# Real RFP samples

Public-sector procurement documents used to test the analysis engine against
material it was not tuned on. Downloaded, not committed: these are third-party
documents, and redistributing them from this repository is somebody else's
licensing question. `.gitignore` excludes the PDFs; this file records where they
came from so the set is reproducible.

| File | Source | Size |
|---|---|---|
| `mercer-island-software-implementation-rfp.pdf` | City of Mercer Island, WA — Software and Implementation Services RFP | 346 KB |
| `santa-fe-county-meeting-software-rfp.pdf` | Santa Fe County, NM — RFP 2026-0391-CMO, Agenda and Meeting Software | 517 KB |

Re-fetch:

```bash
mkdir -p samples/rfp && cd samples/rfp
curl -LO "https://www.mercerisland.gov/sites/default/files/fileattachments/public_works/page/29818/1_-_city_of_mercer_island_-_rfp.pdf"
curl -LO "https://www.santafecountynm.gov/documents/solicitations/2026-0391-CMO_RFP_Agenda_and_Meeting_Software.pdf"
```

## Why these two

Software procurement RFPs are obligation-dense, structurally unlike the demo
corpus (numbered clauses, tables and form fields rather than speaker turns), and
carry no confidentiality risk.

Note for conflict detection: these two are unrelated procurements by different
buyers, so cross-document conflicts between them are not expected and their
absence is not a defect. The domain's real multi-document case is an RFP against
its own addenda and Q&A responses, which routinely contradict the base document.
