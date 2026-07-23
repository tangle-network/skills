# Direct API escape route

Prefer `@tangle-network/sandbox`. Use direct HTTP only when a required public
operation is unavailable in the published package and the API contract is
versioned and tested.

Before adding direct calls:

1. inspect the current published package and public API documentation;
2. confirm the missing operation cannot be expressed through `Sandbox`,
   `SandboxInstance`, or a documented subpath;
3. add the capability to the SDK when it is generally useful;
4. if an immediate direct call remains necessary, isolate it behind one typed
   adapter and contract-test success, auth failure, unavailable sandbox,
   timeout, and
   terminal stream failure;
5. link the exact API version rather than copying a table that will drift.

Do not hand-write a partial SSE parser, return placeholder content or zero
usage, map lifecycle states optimistically, or call internal sidecar endpoints
from a browser. A direct adapter must preserve published SDK failure semantics
and terminal error events. Do not invent a typed stale-mapping result that is
absent from the installed package declaration.
