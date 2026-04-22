# Tangle Blueprint Overview

## Vision

A Tangle Blueprint is a developer-defined capability template for decentralized infrastructure.
It is not a live service by itself.

Blueprints let developers ship infrastructure/services/apps that plug directly into the Tangle protocol and inherit:

1. Verifiable job execution and result reporting.
2. Cryptographic attestations and auditable lifecycle state.
3. Native operator-market economics where customers pay operators for service execution.
4. A standard service lifecycle that can be reused across many product categories.

This is the foundation for a decentralized cloud model:

- today: primarily AI agents, AI sandboxes, and AI infra services
- also valid for: crypto infra and general off-chain infrastructure services

## Mental Model (Hierarchy)

Always distinguish these layers:

1. **Blueprint**
   - abstract capability contract (jobs, params, lifecycle constraints)
   - defines what can be offered
2. **Operator registration**
   - operators opt into specific blueprints
   - advertises runtime capability and availability for that template
   - see [TANGLE-BLUEPRINT-BPM-VS-INSTANCE.md](./TANGLE-BLUEPRINT-BPM-VS-INSTANCE.md) for BPM (the operator-side SDK harness that handles registration / provisioning / payment settlement / slashing on behalf of author) vs the Blueprint Instance (the author-written product code running per service request)
3. **Service request**
   - customer chooses request parameters and a subset of registered operators
4. **Service instance**
   - concrete running instance created from one request + selected operators
   - all state mutations are scoped to this instance

Do not conflate blueprint registration with service provisioning.
Provisioning is instance-level behavior.

## Economic + Trust Flow

1. Developer publishes blueprint definition.
2. Operators register for the blueprint.
3. Customer requests a service and selects operators.
4. Operators approve/join and run the instance.
5. Customer submits jobs against the instance.
6. Protocol records job state/results/attestations and payment-related events.

Result: developers monetize blueprint logic, operators monetize execution, customers get verifiable service outcomes.

## Tenancy Choices

Every blueprint/service design must choose tenancy model explicitly.

1. **Single-tenant service instance**
   - one customer trust boundary per instance
   - simpler isolation and auth model
2. **Multi-tenant service instance**
   - one instance hosts multiple customer tenants
   - requires strict tenant identity, isolation, and authorization controls

A blueprint can support either model, but implementation/testing/auth must match the selected model.

## Authentication Implications

Authentication is layered and must align to hierarchy:

1. Protocol-level caller authorization for state-changing operations.
2. Operator identity and role checks for operator-only actions.
3. Service-instance scoped authorization for instance mutations.
4. Tenant-scoped authorization (only for multi-tenant instances).

## Testing Implications

Production-like validation should prove end-to-end behavior with real protocol flows:

1. Deploy/register blueprint.
2. Register operator(s).
3. Request service with selected operators.
4. Approve and resolve active service instance.
5. Submit jobs and verify observed results/attestations.

Required evidence includes `blueprint_id`, `request_id`, `service_id`, and relevant `call_id` values.

For tenancy:

- single-tenant: prove no cross-instance state bleed
- multi-tenant: prove tenant isolation + tenant-level authz

## UI/Product Guidance

UI should expose product value first, infra knobs second.

1. Keep sensible defaults in primary flows.
2. Place backend/runtime controls in Advanced settings.
3. Use shared packages for repeated chain/service/job UX.
4. Keep product-specific UX local to each blueprint app.

## What Tangle Blueprint Is Building Toward

Tangle Blueprint is effectively an SDK/DSL for shipping protocol-native infrastructure businesses:

- developers define capabilities once
- operators execute them as decentralized supply
- customers consume verifiable services with standardized lifecycle and payment rails

This pattern scales from one VM to full cloud-like service planes, as long as hierarchy, tenancy, and auth boundaries stay explicit.
