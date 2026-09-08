## Purpose
Manages a business owner's own customer/vendor contact list (name, phone, email, address per business) — e.g. for invoicing/document creation. Distinct from the accountant↔user "client" relationship, which is modeled by the `delegation` topic, not this one.

## Key entities/files
- `clients.entity.ts` — `Clients`: `clientRowId` PK, `userId` (owner firebaseId), `businessNumber`, `name`, `phone`, `email`, `address`, plus a legacy `id` (string, e.g. ID/VAT number). Unique constraint on `(userId, name)`.
- `create-client.dto.ts` / `update-client.dto.ts` — validation DTOs (name/businessNumber required on create; all fields optional on update).
- `clients.service.ts` — `ClientsService`: `addClient` (rejects duplicate name per user), `getClients(userId, businessNumber)`, `updateClient`, `deleteClient` — all scoped by `userId` ownership.
- `clients.controller.ts` — `/clients` REST endpoints behind `FirebaseAuthGuard`.

## Main flows
- `POST /clients/add-client` — create a contact for a business (409 if name already used by this user).
- `GET /clients/get-clients/:businessNumber` — list a business's contacts (empty array if none).
- `PATCH /clients/update-client/:id` — partial update by `clientRowId`.
- `DELETE /clients/delete-client/:id` — delete by `clientRowId`.

## Related topics
- demo-data (seeds/reads `Clients` rows for demo businesses)
- delegation, users (registered in `ClientsModule`'s `TypeOrmModule.forFeature` but not currently used by `ClientsService` — likely leftover/for future access-control wiring)
