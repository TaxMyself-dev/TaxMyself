# Architecture diagrams

These diagrams are visual orientation aids for the transaction and accounting
pipeline. They do not override current code, tests, topic `AGENTS.md`, or the
binding accounting redesign plan.

| Diagram | Scope | Source |
|---|---|---|
| [Sync flow](01-sync-flow.png) | Feezback fetch, normalization, classification overlay and cache writes | [Mermaid](01-sync-flow.mmd) |
| [User journey](02-user-journey.png) | Classification through review, expense creation and reporting lock | [Mermaid](02-user-journey.mmd) |
| [Schema](03-schema.png) | Main entities participating in that flow | [Mermaid](03-schema.mmd) |

The `.mmd` file is canonical for each picture. Update and re-render both files
in the same task whenever a pictured flow changes. Because these diagrams are
snapshots, verify detailed behavior in the relevant backend/frontend topic
documentation before implementation.

Render locally with Mermaid CLI, for example:

```bash
npx -y -p @mermaid-js/mermaid-cli mmdc -i docs/architecture/01-sync-flow.mmd -o docs/architecture/01-sync-flow.png -b transparent -w 1800
```
