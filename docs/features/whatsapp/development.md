# WhatsApp document upload checkpoints

## Commit 1 Routing

Run from `backend` in PowerShell after `npm ci`:

```powershell
$env:WHATSAPP_DEV_TOKEN = 'your-local-test-token-at-least-24-characters'
npm run start:whatsapp:sandbox
```

Import `development.postman_collection.json` into Postman. Set `devToken` locally
to the same value. Keep `baseUrl` at `http://127.0.0.1:8091`.
Run folder **01 Routing (commit 1)**. Every request includes automated assertions.

The sandbox has two fictional bindings: 0500000001 -> sandbox-user / sandbox-business;
0500000002 -> sandbox-multi / business-a and business-b. They are not real customers.
Try no token (401), `from=abc` (400), and an unbound phone (UNKNOWN_SENDER).
Health returning READY means the local development API is ready, not that Meta or
Drive is connected. No database, Drive, account mutations or schema changes occur.

## Next checkpoint

Document validation, existing importer adapter, duplicate-event handling and
upload tests will be added in the next commit. Production account linking,
durable event storage and Meta media download remain separate milestones.
