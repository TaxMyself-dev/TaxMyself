# Provider-confirmed media location

- Provider supplied one media domain and signed private-bucket path.
- Configured only local ignored backend/.env LYCHEE_MEDIA_HOSTS; other values
  preserved. No cloud configuration, live media request, messaging or deployment.
- Download requires allowlisted HTTPS host plus exact path prefix
  /storage/v1/object/sign/wap-media-private/. No redirects or API key forwarding.
- Each attempt requests a new signed link; expires_in_seconds describes its TTL.
  No signed URLs are stored in SQL or logs.
- Focused media tests: 3 passed, including other-bucket/unsigned-path rejection.
  Nest build result reported in chat. No database/schema changes.
