# Shared document AI queue

All document AI admission belongs here. One tenant may use all spare capacity; fairness applies only when tenants compete. Provider/model quotas and leases are shared through short DB transactions, never connection-holding locks during AI. Unknown paid outcomes must not be replayed or switched to another provider automatically. Preserve purpose-specific retention and ownership. No live DB, app bootstrap, schema application, existing-work migration, real providers or deletion during development.
