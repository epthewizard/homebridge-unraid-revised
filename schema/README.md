# Unraid GraphQL schema snapshot

`unraid.schema.json` is the full Apollo GraphQL introspection result captured
from the configured local Unraid endpoint on 2026-09-22. It contains 251 types,
58 query fields, 45 mutation fields, and 17 subscription fields.

The runtime operations in `src/modern/unraid-client.ts` were selected from this
snapshot: array/disk state, Docker containers, VM domains, and the nested
Docker/VM start and stop mutations. Refresh this file after an Unraid upgrade
or plugin/API change before extending the client.
