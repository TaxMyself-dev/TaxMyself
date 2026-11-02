# Feezback proxy

Install dependencies with npm ci and run regression checks with npm test from this directory. There is no compilation/build step for this JavaScript service.

## Empty-body handling

The JSON parser records the parsed byte count so a zero-byte request remains distinct from an actual empty object or array. The fallback reader must not wait for another end event after the stream has already ended. Parsed empty objects/arrays must still be serialized upstream so a consumed request body does not leave a nonzero Content-Length without bytes.

body-parsing.test.js executes the actual middleware against two loopback HTTP servers, with the upstream target overridden locally, startup/NAT probing disabled, and webhook fetch mocked. It covers empty/no-framing/zero-length/chunked DELETE, empty and nonempty JSON, GET, token/link POST, PUT/PATCH, malformed JSON rejection, JSON-key compatibility, webhook acknowledgement/forwarding, and credential redaction. logging.test.js retains the existing header/body redaction checks. Tests send no real consent cancellations or external network requests.

This fix requires a separate authorized proxy deployment to affect the live service. A local commit does not change the deployed proxy.
