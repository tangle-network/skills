---
name: blueprint-frontend
description: Use when building frontend applications for Tangle Blueprints — job submission, operator discovery, service provisioning, session auth, agent chat/terminal UX, or integrating @tangle-network/blueprint-ui and @tangle-network/agent-ui.
---

# Blueprint Frontend

Use this skill when building React frontends for Tangle Network blueprints. Covers the shared UI libraries (`@tangle-network/blueprint-ui`, `@tangle-network/agent-ui`), on-chain interaction patterns, session auth, and product-level integration.

## What This Skill Covers

- Registering blueprints and defining job metadata for UI rendering
- On-chain job submission, operator discovery, and RFQ pricing
- Service validation and provision progress tracking
- Session auth (EIP-191 challenge + PASETO tokens)
- Agent chat and terminal UX via agent-ui
- Dual-mode API clients (direct sidecar vs proxied operator)
- Web3 provider setup (wagmi, viem, ConnectKit)
- Theme and styling with blueprint-ui presets

## UI Layer Architecture

Three layers with strict boundaries:

### Layer 1: `@tangle-network/blueprint-ui` (shared library)

Chain/contract interaction, job forms, stores, layout primitives. App-agnostic — no product-specific routing or copy.

Source: `~/code/blueprint-ui/`

Three export entry points:
- `@tangle-network/blueprint-ui` — hooks, stores, contracts, utilities
- `@tangle-network/blueprint-ui/components` — UI components
- `@tangle-network/blueprint-ui/preset` — UnoCSS theme tokens

### Layer 2: `@tangle-network/agent-ui` (agent runtime UX)

Chat, terminal, session streaming. No chain/contract logic — that belongs in blueprint-ui.

Source: `~/code/ai-agent-sandbox-blueprint/packages/agent-ui/`

Entry points:
- `@tangle-network/agent-ui` — components, hooks, types
- `@tangle-network/agent-ui/primitives` — small helpers
- `@tangle-network/agent-ui/terminal` — lazy xterm.js terminal
- `@tangle-network/agent-ui/styles` — stylesheet

### Layer 3: App-level UI (product-specific)

Blueprint definitions, API clients, deploy state machines, product routing. Lives in each blueprint's `ui/` directory.

**Rule**: If Sandbox and another app share 20+ lines of agent-facing code, extract to agent-ui. If they share chain/contract logic, extract to blueprint-ui. Keep product-specific glue in the app.

## Blueprint Registration

Register blueprints at app startup to enable generic job forms and submission:

```typescript
import { registerBlueprint, type BlueprintDefinition, type JobDefinition } from '@tangle-network/blueprint-ui';

const MY_JOBS: JobDefinition[] = [
  {
    id: 0,
    name: 'create_instance',
    label: 'Create Instance',
    description: 'Provision a new sandbox instance',
    category: 'lifecycle',
    icon: 'i-ph:play',
    pricingMultiplier: 1.0,
    requiresSandbox: false,
    fields: [
      {
        name: 'name',
        label: 'Instance Name',
        type: 'text',
        required: true,
        abiType: 'string',
        abiParam: 'name',
      },
      {
        name: 'cpu_cores',
        label: 'CPU Cores',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 16,
        abiType: 'uint64',
        abiParam: 'cpu_cores',
      },
      {
        name: 'runtime_backend',
        label: 'Runtime',
        type: 'select',
        defaultValue: 'docker',
        options: [
          { label: 'Docker', value: 'docker' },
          { label: 'Firecracker', value: 'firecracker' },
        ],
        abiType: 'string',
        abiParam: 'runtime_backend',
      },
    ],
  },
];

const MY_BLUEPRINT: BlueprintDefinition = {
  id: 'my-blueprint',
  name: 'My Blueprint',
  version: '1.0.0',
  description: 'Description',
  icon: 'i-ph:cube',
  color: '#3B82F6',
  contracts: {
    31337: '0x...', // local
    3799: '0x...',  // testnet
  },
  jobs: MY_JOBS,
  categories: [
    { key: 'lifecycle', label: 'Lifecycle', icon: 'i-ph:arrows-clockwise' },
  ],
};

registerBlueprint(MY_BLUEPRINT);
```

### Key Types

```typescript
type JobCategory = 'lifecycle' | 'execution' | 'batch' | 'workflow' | 'ssh' | 'management';

interface JobFieldDef {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json' | 'combobox';
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: { label: string; value: string }[];
  helperText?: string;
  min?: number; max?: number; step?: number;
  abiType?: string;    // e.g. 'uint64', 'string', 'address[]'
  abiParam?: string;   // Solidity param name
  internal?: boolean;  // included in encoding but hidden from form
}

interface JobDefinition {
  id: number;
  name: string;
  label: string;
  description: string;
  category: JobCategory;
  icon: string;
  pricingMultiplier: number;
  fields: JobFieldDef[];
  requiresSandbox: boolean;
  warning?: string;
  contextParams?: AbiContextParam[];  // e.g. sidecar_url, sandbox_id
  customEncoder?: (values, context?) => `0x${string}`;  // for nested structs
}
```

## On-Chain Job Submission

### Flow

```
useOperators()     → discover operators for blueprint
  ↓
useQuotes()        → fetch RFQ pricing from operators
  ↓
useJobForm()       → manage form state from JobDefinition
  ↓
encodeJobArgs()    → ABI-encode form values using field metadata
  ↓
useSubmitJob()     → submit on-chain, track TX lifecycle
  ↓
useProvisionProgress() → poll provision status until ready
```

### useSubmitJob

```typescript
import { useSubmitJob } from '@tangle-network/blueprint-ui';

const { submitJob, status, txHash, callId, error, reset } = useSubmitJob();

await submitJob({
  serviceId: 1n,
  jobId: 0,                    // matches JobDefinition.id
  args: encodeJobArgs(job, formValues, context),
  label: 'Create Instance',
  value: quotedPrice,          // optional payment
});

// status: 'idle' → 'signing' → 'pending' → 'confirmed' | 'failed'
// callId: extracted from JobCalled event logs
```

### useOperators

```typescript
import { useOperators } from '@tangle-network/blueprint-ui';

const { operators, operatorCount, isLoading, error } = useOperators();
// operators: { address, ecdsaPublicKey, rpcAddress }[]
```

### useQuotes (RFQ Pricing)

```typescript
import { useQuotes, formatCost } from '@tangle-network/blueprint-ui';

const { quotes, totalCost, isLoading, isSolvingPow } = useQuotes(
  operators,
  blueprintId,
  ttlBlocks,
  enabled,
);
// quotes: { operator, totalCost, signature, details, costRate }[]
// Internally solves 20-bit SHA256 PoW before requesting quote
```

### useJobPrice (Per-Job Pricing)

```typescript
import { useJobPrice } from '@tangle-network/blueprint-ui';

const { quote, formattedPrice, isLoading } = useJobPrice(
  operatorRpcUrl,
  serviceId,
  jobIndex,
  blueprintId,
  enabled,
);
```

### encodeJobArgs

```typescript
import { encodeJobArgs } from '@tangle-network/blueprint-ui';

const encoded = encodeJobArgs(jobDefinition, formValues, {
  sidecar_url: 'http://...',
  sandbox_id: '0x...',
});
// Returns ABI-encoded 0x... string
// Handles coercion: bools, uintX, strings, arrays
// Delegates to job.customEncoder for complex structs
```

## Service Validation

```typescript
import { useServiceValidation } from '@tangle-network/blueprint-ui';

const { validate, serviceInfo, isValidating, error } = useServiceValidation();

const info = await validate(serviceId, userAddress);
// info: { active, blueprintId, owner, operatorCount, operators, permitted, ttl, createdAt }
```

## Provision Progress

```typescript
import { useProvisionProgress, getPhaseLabel } from '@tangle-network/blueprint-ui';

const { phase, progressPct, sandboxId, sidecarUrl, isReady, isFailed, message } =
  useProvisionProgress(callId, operatorRpcUrl, enabled);

// Phases: queued → image_pull → container_create → container_start → health_check → ready | failed
// Polls every 2s, stops on terminal phase
```

## Session Auth (EIP-191 + PASETO)

### Blueprint-UI Level

```typescript
import { useSessionAuth, useAuthenticatedFetch } from '@tangle-network/blueprint-ui';

const { session, isAuthenticated, authenticate, logout } = useSessionAuth(sandboxId, operatorUrl);
// Challenge-response: request challenge → sign with wallet → exchange for PASETO token
// Stored in sessionMapStore (persisted to localStorage, keyed by sandboxId)

const { authFetch } = useAuthenticatedFetch(sandboxId, operatorUrl);
const res = await authFetch('/api/instances');
// Auto-injects Bearer token, re-authenticates on 401
```

### Agent-UI Level

```typescript
import { useSidecarAuth, useWagmiSidecarAuth } from '@tangle-network/agent-ui';

// Generic (any signing method):
const { token, isAuthenticated, authenticate } = useSidecarAuth(sidecarUrl, signMessage);

// Wagmi adapter:
const auth = useWagmiSidecarAuth(sidecarUrl);
```

## Agent Chat & Terminal

### Chat

```typescript
import { ChatContainer, useSessionStream } from '@tangle-network/agent-ui';

const { messages, partMap, isStreaming, send, abort } = useSessionStream({
  sidecarUrl,
  sessionId,
  token,
});

<ChatContainer
  messages={messages}
  partMap={partMap}
  isStreaming={isStreaming}
  onSend={send}
  branding={{ name: 'My Agent', icon: '...' }}
/>
```

### Terminal

```typescript
import { TerminalView } from '@tangle-network/agent-ui/terminal';
import { usePtySession } from '@tangle-network/agent-ui';

const pty = usePtySession(sidecarUrl, token);

<TerminalView session={pty} />
// Lazy-loads xterm.js (~333KB)
```

## Dual-Mode API Client

Apps should support both direct sidecar access (local dev) and proxied operator API (production):

```typescript
// Direct mode (local testing):
const client = createDirectClient('http://localhost:32768', authToken);
await client.prompt('hello');  // POST /agent/prompt

// Proxied mode (production, through operator):
const client = createProxiedClient('sandbox-id', pasetoToken, 'http://operator:9090');
await client.prompt('hello');  // POST /api/sandboxes/sandbox-id/prompt
```

Pattern from ai-agent-sandbox-blueprint (`ui/src/lib/api/sandboxClient.ts`).

## Stores

### infraStore (Blueprint/Service Selection)

```typescript
import { infraStore, updateInfra, getInfra } from '@tangle-network/blueprint-ui';

updateInfra({ blueprintId: '1', serviceId: '1' });
const { blueprintId, serviceId, serviceInfo } = getInfra();
// Persisted to localStorage
```

### txListStore (Transaction History)

```typescript
import { txListStore, addTx, updateTx, pendingCount } from '@tangle-network/blueprint-ui';

addTx({ hash, label: 'Create Instance', status: 'pending', chainId });
// Max 50 TXs, BigInt-aware serialization
```

### sessionMapStore (PASETO Sessions)

```typescript
import { getSession, setSession, removeSession, gcSessions } from '@tangle-network/blueprint-ui';

const session = getSession(sandboxId);
// { token, address, expiresAt, sandboxId }
// Auto-cleans expired sessions (60s buffer)
```

## Web3 Provider Setup

```typescript
import { Web3Shell } from '@tangle-network/blueprint-ui/components';
import { tangleWalletChains, createTangleTransports, defaultConnectKitOptions } from '@tangle-network/blueprint-ui';
import { createConfig, WagmiProvider } from 'wagmi';
import { getDefaultConfig } from 'connectkit';

const config = createConfig(
  getDefaultConfig({
    chains: tangleWalletChains, // [tangleLocal, tangleTestnet, tangleMainnet, mainnet]
    transports: createTangleTransports(),
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
    ...defaultConnectKitOptions,
  }),
);

// Web3Shell wraps with WagmiProvider + QueryClientProvider
<Web3Shell config={config}>
  <App />
</Web3Shell>
```

## Chain Configuration

```typescript
import {
  tangleLocal, tangleTestnet, tangleMainnet,
  configureNetworks, getNetworks, resolveRpcUrl,
  selectedChainIdStore, getPublicClient, getAddresses,
} from '@tangle-network/blueprint-ui';

// Register networks with contract addresses
configureNetworks([
  { chain: tangleLocal, rpcUrl: resolveRpcUrl(), label: 'Local', addresses: { jobs: '0x...', services: '0x...' } },
  { chain: tangleTestnet, rpcUrl: 'https://testnet-rpc.tangle.tools', label: 'Testnet', addresses: { ... } },
]);

// Chain switching updates publicClient automatically
selectedChainIdStore.set(3799); // switch to testnet
const client = getPublicClient();
const { jobs, services } = getAddresses();
```

## Layout Components

```typescript
import {
  AppDocument, Web3Shell, ChainSwitcher, ThemeToggle, AppToaster, AnimatedPage,
} from '@tangle-network/blueprint-ui/components';

// AppDocument: sets <html data-theme>, prevents FOUC, preloads fonts
// ChainSwitcher: dropdown for Local/Testnet/Mainnet
// ThemeToggle: dark/light toggle
// AppToaster: sonner toast integration
// AnimatedPage: framer-motion page transitions
```

## Form Components

```typescript
import { BlueprintJobForm, JobExecutionDialog } from '@tangle-network/blueprint-ui/components';
import { useJobForm } from '@tangle-network/blueprint-ui';

// Manual form rendering:
const { values, errors, onChange, validate } = useJobForm(jobDefinition);
<BlueprintJobForm job={jobDefinition} values={values} onChange={onChange} errors={errors} />

// Complete dialog (form + pricing + submission):
<JobExecutionDialog
  open={open}
  onOpenChange={setOpen}
  job={jobDefinition}
  serviceId={serviceId}
  context={{ sandbox_id: '0x...' }}
  onSuccess={(callId) => watchProvision(callId)}
/>
```

## Theme & Styling

```typescript
import { bpThemeTokens } from '@tangle-network/blueprint-ui/preset';

// UnoCSS config:
export default defineConfig({
  theme: {
    colors: {
      bp: bpThemeTokens('myapp'),
    },
  },
});

// Usage in components:
// text-bp-elements-textPrimary
// bg-bp-elements-background-depth-1
// border-bp-elements-borderColor
```

## Embedded UI Pattern

For blueprints that serve UI from the operator binary (Rust):

```rust
// In operator_api.rs:
use include_dir::{include_dir, Dir};

static CONTROL_PLANE_UI_DIR: Dir = include_dir!("$CARGO_MANIFEST_DIR/../control-plane-ui");

// Serve at root:
// GET / → index.html
// GET /app.js, /styles.css, /assets/* → static files
```

Build: `cd ui && pnpm run build:embedded` compiles React app into `control-plane-ui/` directory, which gets embedded at `cargo build` time.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_CHAIN_ID` | Default chain (31337 local, 3799 testnet, 5845 mainnet) |
| `VITE_RPC_URL` | RPC endpoint (defaults to localhost:8545) |
| `VITE_BLUEPRINT_ID` | Default blueprint ID |
| `VITE_SERVICE_ID` | Default service ID |
| `VITE_OPERATOR_API_URL` | Operator API endpoint |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID |
| `VITE_OPERATOR_API_TOKEN` | Operator bearer token (dev) |

## On-Chain vs Off-Chain Split

**On-chain (state-changing, via `useSubmitJob`):**
- Create/delete sandbox instances
- Create/trigger/cancel workflows
- Service request/approve

**Off-chain (operator HTTP API, via `useAuthenticatedFetch`):**
- exec, prompt, task, stop, resume
- SSH, terminal, secrets
- Snapshot, health checks
- Instance status queries

Jobs mutate state. Everything else goes through the operator API.

## Critical Files

### blueprint-ui
- `src/index.ts` — main exports (hooks, stores, contracts, utils)
- `src/components.ts` — component exports
- `src/preset.ts` — UnoCSS theme tokens
- `src/hooks/useSubmitJob.ts` — job submission
- `src/hooks/useOperators.ts` — operator discovery
- `src/hooks/useQuotes.ts` — RFQ pricing with PoW
- `src/hooks/useJobPrice.ts` — per-job pricing
- `src/hooks/useServiceValidation.ts` — service validation
- `src/hooks/useSessionAuth.ts` — PASETO session management
- `src/hooks/useProvisionProgress.ts` — provision tracking
- `src/hooks/useJobForm.ts` — form state management
- `src/blueprints/registry.ts` — blueprint registration
- `src/contracts/abi.ts` — Tangle contract ABIs
- `src/contracts/chains.ts` — chain definitions
- `src/contracts/publicClient.ts` — reactive public client
- `src/contracts/generic-encoder.ts` — ABI argument encoding
- `src/stores/` — infraStore, sessionMapStore, txListStore, themeStore
- `src/components/forms/BlueprintJobForm.tsx` — job form renderer
- `src/components/forms/JobExecutionDialog.tsx` — complete submission dialog

### agent-ui
- `src/index.ts` — public API
- `src/hooks/useSidecarAuth.ts` — EIP-191 + PASETO auth
- `src/hooks/useSessionStream.ts` — SSE message streaming
- `src/hooks/usePtySession.ts` — PTY terminal
- `src/components/chat/ChatContainer.tsx` — full chat UI

### Reference app implementations
- `~/code/ai-agent-sandbox-blueprint/ui/src/lib/blueprints/sandbox-blueprint.ts` — blueprint definition example
- `~/code/ai-agent-sandbox-blueprint/ui/src/lib/api/sandboxClient.ts` — dual-mode API client
- `~/code/ai-agent-sandbox-blueprint/ui/src/lib/hooks/useCreateDeploy.ts` — deploy state machine
- `~/code/openclaw-sandbox-blueprint/ui/src/App.tsx` — embedded UI with tab-based instance management

## Rules

1. **Jobs are mutations only.** Reads and operational I/O use `eth_call` and operator HTTP API.
2. **blueprint-ui is app-agnostic.** No product-specific routing, copy, or feature orchestration.
3. **agent-ui is for agent runtime UX only.** No chain/contract logic — that belongs in blueprint-ui.
4. **Keep product-specific glue in app-local code.** Don't duplicate shared primitives locally.
5. **Always use `encodeJobArgs` for ABI encoding.** Don't hand-roll encoding from form values.
6. **Pre-estimate gas before submission.** Bypasses MetaMask RPC issues on Tangle chains.
7. **Support dual-mode API clients.** Direct sidecar for dev, proxied operator for production.
8. **Session tokens are sandboxId-scoped.** Don't reuse tokens across sandboxes.
9. **Auto-clean expired sessions.** Use `gcSessions()` or rely on sessionMapStore's built-in cleanup.
