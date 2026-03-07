# Tangle Blueprint BSM (Blueprint Service Manager) Hook System

## 1. Overview

A **Blueprint Service Manager (BSM)** is a Solidity contract that a blueprint developer deploys to customize every aspect of their blueprint's on-chain behavior. It is the primary integration point between the Tangle protocol core (`Tangle.sol` and its mixins) and the blueprint developer's business logic.

**Architecture hierarchy:**

```
MBSMRegistry               -- Versioned registry of Master BSMs
  MasterBlueprintServiceManager  -- Protocol-wide sink for blueprint definitions
    IBlueprintServiceManager     -- Per-blueprint hook interface (the BSM)
      BlueprintServiceManagerBase  -- Base contract with sensible defaults
        YourCustomBSM              -- Blueprint developer's contract
```

When a blueprint is created, the Tangle core calls `onBlueprintCreated` on the BSM, passing the `blueprintId`, `owner`, and `tangleCore` address. From that point on, the Tangle core invokes hooks on the BSM at every lifecycle event -- operator registration, service requests, job execution, slashing, payments, and more.

**Why write a BSM?**

- Validate operators during registration (allowlists, stake checks, capability proofs)
- Enforce payment minimums or asset restrictions on service requests
- Control dynamic membership (who can join/leave running services)
- Customize job result quorum requirements
- Route developer payment revenue to specific addresses
- Integrate BLS signature aggregation for consensus jobs
- Enforce custom slashing authorities and dispute resolution
- Track state for your blueprint's application logic

**The key design principle:** inherit `BlueprintServiceManagerBase`, override only the hooks you need. All hooks have safe no-op defaults that allow operations to proceed.

### Calling semantics: `_callManager` vs `_tryCallManager`

The Tangle core uses two internal functions to invoke BSM hooks:

- **`_callManager(manager, data)`** -- Reverts the entire transaction if the BSM hook reverts. Used for hooks where the BSM should be able to reject the operation (e.g., `onRequest`, `onJobCall`, `onRegister`).
- **`_tryCallManager(manager, data)`** -- Silently ignores failures. Used for notification-only hooks where the BSM should not block protocol operations (e.g., `onServiceTermination`, `onJobResult`, `onApprove`, `onSlash`, membership notifications).

This distinction is critical: a reverting `onRequest` hook blocks the service request. A reverting `onServiceTermination` hook does NOT block termination.

**Source files:**
- Interface: [tnt-core/src/interfaces/IBlueprintServiceManager.sol](https://github.com/tangle-network/tnt-core/blob/main/src/interfaces/IBlueprintServiceManager.sol)
- Base contract: [tnt-core/src/BlueprintServiceManagerBase.sol](https://github.com/tangle-network/tnt-core/blob/main/src/BlueprintServiceManagerBase.sol)
- Core calling code: [tnt-core/src/core/Base.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/Base.sol) (lines 727-741)

---

## 2. BlueprintServiceManagerBase

The base contract provides default implementations for every hook in `IBlueprintServiceManager`. Blueprint developers inherit from it and override only what they need.

**Source:** [tnt-core/src/BlueprintServiceManagerBase.sol](https://github.com/tangle-network/tnt-core/blob/main/src/BlueprintServiceManagerBase.sol)

### State variables

```solidity
address public tangleCore;      // Set once in onBlueprintCreated
uint64 public blueprintId;      // Set once in onBlueprintCreated
address public blueprintOwner;  // Set once in onBlueprintCreated

// Internal: per-service permitted payment assets
mapping(uint64 => EnumerableSet.AddressSet) private _permittedPaymentAssets;
```

### Modifiers

```solidity
modifier onlyFromTangle() {
    if (msg.sender != tangleCore) {
        revert OnlyTangleAllowed(msg.sender, tangleCore);
    }
    _;
}

modifier onlyBlueprintOwner() {
    if (msg.sender != blueprintOwner) {
        revert OnlyBlueprintOwnerAllowed(msg.sender, blueprintOwner);
    }
    _;
}
```

**`onlyFromTangle`** is applied to every hook in the base contract except `onBlueprintCreated` (which sets the `tangleCore` address). When overriding hooks, always include `onlyFromTangle` to prevent unauthorized calls.

### Override pattern

```solidity
contract MyBSM is BlueprintServiceManagerBase {
    function onRegister(address operator, bytes calldata inputs)
        external payable override onlyFromTangle
    {
        // Custom validation
        require(isWhitelisted(operator), "Not whitelisted");
    }
}
```

### Internal helpers for payment assets

```solidity
function _permitAsset(uint64 serviceId, address asset) internal virtual returns (bool);
function _revokeAsset(uint64 serviceId, address asset) internal virtual returns (bool);
function _clearPermittedAssets(uint64 serviceId) internal virtual;
function _getPermittedAssets(uint64 serviceId) internal view virtual returns (address[] memory);
```

### Payment receiver

The base contract includes a `receive()` function that accepts native token payments and calls `_onPaymentReceived(address(0), msg.value)`. Override `_onPaymentReceived` to handle revenue distribution, buybacks, etc.

---

## 3. All Hook Categories

### 3.1 Blueprint Lifecycle

| Hook | Called via | Default | Must override? |
|------|-----------|---------|----------------|
| `onBlueprintCreated` | `_callManager` (at creation) | Sets `blueprintId`, `blueprintOwner`, `tangleCore`; reverts if already initialized | Rarely -- base implementation handles initialization |

```solidity
function onBlueprintCreated(
    uint64 blueprintId,
    address owner,
    address tangleCore
) external;
```

**Note:** The base implementation uses an `AlreadyInitialized` guard -- `tangleCore` can only be set once. If you override, preserve this guard.

---

### 3.2 Operator Lifecycle

| Hook | Called via | Default | Must override? |
|------|-----------|---------|----------------|
| `onRegister` | `_callManager` | Accept all; no-op | Override to validate operators |
| `onUnregister` | `_tryCallManager` | No-op | Override to enforce cleanup |
| `onUpdatePreferences` | `_tryCallManager` | No-op | Rarely needed |

```solidity
function onRegister(address operator, bytes calldata registrationInputs) external payable;
function onUnregister(address operator) external;
function onUpdatePreferences(address operator, bytes calldata newPreferences) external payable;
```

**`onRegister` can reject** -- if it reverts, the operator registration fails. This is the gatekeeper for operator quality. The `registrationInputs` are blueprint-specific encoded data (e.g., capacity declarations, capability proofs).

`onUnregister` and `onUpdatePreferences` are called via `_tryCallManager` -- failures are silently ignored.

---

### 3.3 Service Lifecycle

| Hook | Called via | Default | Must override? |
|------|-----------|---------|----------------|
| `onRequest` | `_callManager` | Accept all; no-op | Override to validate requests/payments |
| `onApprove` | `_tryCallManager` | No-op | Rarely needed |
| `onReject` | `_tryCallManager` | No-op | Rarely needed |
| `onServiceInitialized` | `_tryCallManager` | No-op | Override to track active services |
| `onServiceTermination` | `_tryCallManager` | No-op | Override for cleanup |

```solidity
function onRequest(
    uint64 requestId,
    address requester,
    address[] calldata operators,
    bytes calldata requestInputs,
    uint64 ttl,
    address paymentAsset,
    uint256 paymentAmount
) external payable;

function onApprove(address operator, uint64 requestId, uint8 stakingPercent) external payable;
function onReject(address operator, uint64 requestId) external;

function onServiceInitialized(
    uint64 blueprintId,
    uint64 requestId,
    uint64 serviceId,
    address owner,
    address[] calldata permittedCallers,
    uint64 ttl
) external;

function onServiceTermination(uint64 serviceId, address owner) external;
```

**`onRequest` can reject** -- reverting blocks the service request. This is where you enforce minimum payments, validate operator selections, check asset allowlists.

**`onServiceInitialized`** is the signal that a service is live. All requested operators have approved. Use this to initialize per-service state.

**`onServiceTermination`** is notification-only. The service is already being terminated when this fires.

**Source:** [tnt-core/src/core/ServicesRequests.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/ServicesRequests.sol), [tnt-core/src/core/ServicesApprovals.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/ServicesApprovals.sol), [tnt-core/src/core/ServicesLifecycle.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/ServicesLifecycle.sol)

---

### 3.4 Dynamic Membership

| Hook | Called via | Default | Must override? |
|------|-----------|---------|----------------|
| `canJoin` | `try/catch` (view) | Returns `true` | Override to gatekeep joins |
| `onOperatorJoined` | `_tryCallManager` | No-op | Override to track members |
| `canLeave` | `try/catch` (view) | Returns `true` | Override to prevent departures |
| `onOperatorLeft` | `_tryCallManager` | No-op | Override for cleanup |
| `onExitScheduled` | `_tryCallManager` | No-op | Rarely needed |
| `onExitCanceled` | `_tryCallManager` | No-op | Rarely needed |

```solidity
function canJoin(uint64 serviceId, address operator) external view returns (bool allowed);
function onOperatorJoined(uint64 serviceId, address operator, uint16 exposureBps) external;
function canLeave(uint64 serviceId, address operator) external view returns (bool allowed);
function onOperatorLeft(uint64 serviceId, address operator) external;
function onExitScheduled(uint64 serviceId, address operator, uint64 executeAfter) external;
function onExitCanceled(uint64 serviceId, address operator) external;
```

These hooks only apply to services using `MembershipModel.Dynamic`. For `MembershipModel.Fixed`, operators are locked at service creation.

**`canJoin` and `canLeave`** are view functions called via `try/catch`. If `canJoin` returns `false`, the join is reverted with `Errors.Unauthorized()`. If the call fails (reverts), the join proceeds (fail-open for catch).

**Source:** [tnt-core/src/core/ServicesLifecycle.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/ServicesLifecycle.sol)

---

### 3.5 Job Lifecycle

| Hook | Called via | Default | Must override? |
|------|-----------|---------|----------------|
| `onJobCall` | `_callManager` | Accept all; no-op | Override to validate jobs |
| `onJobResult` | `_tryCallManager` | Accept all; no-op | Override to process results |

```solidity
function onJobCall(
    uint64 serviceId,
    uint8 job,
    uint64 jobCallId,
    bytes calldata inputs
) external payable;

function onJobResult(
    uint64 serviceId,
    uint8 job,
    uint64 jobCallId,
    address operator,
    bytes calldata inputs,
    bytes calldata outputs
) external payable;
```

**`onJobCall` can reject** -- reverting blocks job submission. Use this for input validation, rate limiting, or job-type gating.

**`onJobResult`** is notification-only. The result has already been recorded. Use this for application-level processing of outputs.

**Source:** [tnt-core/src/core/JobsSubmission.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/JobsSubmission.sol)

---

### 3.6 Slashing

| Hook | Called via | Default | Must override? |
|------|-----------|---------|----------------|
| `onUnappliedSlash` | `_tryCallManager` | No-op | Override to gather evidence |
| `onSlash` | `_tryCallManager` | No-op | Override for post-slash logic |

```solidity
function onUnappliedSlash(uint64 serviceId, bytes calldata offender, uint8 slashPercent) external;
function onSlash(uint64 serviceId, bytes calldata offender, uint8 slashPercent) external;
```

**Note:** The `offender` parameter is `abi.encodePacked(operatorAddress)` -- decode with `address(bytes20(offender))`. The `slashPercent` is 0-100 (converted from internal basis points).

**Source:** [tnt-core/src/core/Slashing.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/Slashing.sol)

---

### 3.7 Authorization Queries

| Hook | Called via | Default | Must override? |
|------|-----------|---------|----------------|
| `querySlashingOrigin` | `try/catch` (view) | Returns `address(this)` | Override for custom slash authority |
| `queryDisputeOrigin` | `try/catch` (view) | Returns `address(this)` | Override for custom dispute authority |

```solidity
function querySlashingOrigin(uint64 serviceId) external view returns (address slashingOrigin);
function queryDisputeOrigin(uint64 serviceId) external view returns (address disputeOrigin);
```

By default, the BSM contract itself is the slashing and dispute authority. Override to delegate to governance contracts, multi-sigs, or per-service dispute resolvers.

**Source:** [tnt-core/src/core/Slashing.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/Slashing.sol)

---

### 3.8 Payment Queries

| Hook | Called via | Default | Must override? |
|------|-----------|---------|----------------|
| `queryDeveloperPaymentAddress` | `try/catch` (view) | Returns `blueprintOwner` | Override for custom routing |
| `queryIsPaymentAssetAllowed` | `try/catch` (view) | Native always allowed; if no assets configured, allow all; otherwise check set | Override for custom asset policies |

```solidity
function queryDeveloperPaymentAddress(uint64 serviceId)
    external view returns (address payable developerPaymentAddress);

function queryIsPaymentAssetAllowed(uint64 serviceId, address asset)
    external view returns (bool isAllowed);
```

**`queryDeveloperPaymentAddress`** is called during payment distribution. The developer share of every payment goes to this address. Override to route payments per-service (e.g., to a DAO treasury for one service, personal wallet for another).

**`queryIsPaymentAssetAllowed`** is called during service requests and job submissions. If it returns `false`, the operation reverts with `Errors.TokenNotAllowed`. The base implementation uses the `_permittedPaymentAssets` set -- native token (`address(0)`) is always allowed, and if no assets are explicitly configured, all are allowed.

**Source:** [tnt-core/src/core/Payments.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/Payments.sol), [tnt-core/src/core/Base.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/Base.sol)

---

### 3.9 Configuration Queries

All configuration queries follow the `(bool useDefault, ...)` return pattern. Return `useDefault=true` to use protocol defaults. Return `useDefault=false` with custom values to override.

| Hook | Default value | Purpose |
|------|---------------|---------|
| `getRequiredResultCount` | `1` | Number of operator results needed to complete a job |
| `getHeartbeatInterval` | Protocol default | How often operators must heartbeat (0 = disabled) |
| `getHeartbeatThreshold` | Protocol default | % of operators that must respond (0-100) |
| `getSlashingWindow` | Protocol default | Dispute window duration in blocks |
| `getExitConfig` | Protocol default (1 day min commitment, 7 day exit queue, no force exit) | Exit queue timing for dynamic services |
| `getNonPaymentTerminationPolicy` | 1 grace interval | Grace periods before non-payment termination |
| `getMinOperatorStake` | Protocol default from staking module | Minimum stake for operator registration |

```solidity
function getRequiredResultCount(uint64 serviceId, uint8 jobIndex) external view returns (uint32 required);

function getHeartbeatInterval(uint64 serviceId)
    external view returns (bool useDefault, uint64 interval);

function getHeartbeatThreshold(uint64 serviceId)
    external view returns (bool useDefault, uint8 threshold);

function getSlashingWindow(uint64 serviceId)
    external view returns (bool useDefault, uint64 window);

function getExitConfig(uint64 serviceId)
    external view returns (
        bool useDefault,
        uint64 minCommitmentDuration,
        uint64 exitQueueDuration,
        bool forceExitAllowed
    );

function getNonPaymentTerminationPolicy(uint64 serviceId)
    external view returns (bool useDefault, uint64 graceIntervals);

function getMinOperatorStake() external view returns (bool useDefault, uint256 minStake);
```

---

### 3.10 BLS Aggregation

| Hook | Default | Purpose |
|------|---------|---------|
| `requiresAggregation` | `false` | Whether a job uses BLS aggregated results |
| `getAggregationThreshold` | `(6700, 0)` = 67% count-based | Threshold for aggregation consensus |
| `onAggregatedResult` | No-op | Called when aggregated result is submitted |

```solidity
function requiresAggregation(uint64 serviceId, uint8 jobIndex) external view returns (bool required);

function getAggregationThreshold(uint64 serviceId, uint8 jobIndex)
    external view returns (uint16 thresholdBps, uint8 thresholdType);
    // thresholdType: 0 = CountBased (% of operators), 1 = StakeWeighted (% of total stake)

function onAggregatedResult(
    uint64 serviceId,
    uint8 job,
    uint64 jobCallId,
    bytes calldata output,
    uint256 signerBitmap,
    uint256[2] calldata aggregatedSignature,  // G1 point [x, y]
    uint256[4] calldata aggregatedPubkey      // G2 point [x0, x1, y0, y1]
) external;
```

When `requiresAggregation` returns `true` for a job, operators cannot use `submitResult` -- they must submit via `submitAggregatedResult` instead. The core contract enforces the threshold and verifies the BLS signature on-chain before calling `onAggregatedResult`.

**Source:** [tnt-core/src/core/JobsAggregation.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/JobsAggregation.sol)

---

## 4. Job Type Taxonomy

### Standard Jobs

The default path. A permitted caller submits a job via `submitJob`, operators respond via `submitResult`.

**Hook sequence:**
1. `onJobCall` -- called when job is submitted (can reject)
2. `onJobResult` -- called for each operator's result submission (notification)
3. Job auto-completes when `resultCount >= getRequiredResultCount`

**Source:** [tnt-core/src/core/JobsSubmission.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/JobsSubmission.sol)

### BLS Aggregation Jobs

For jobs where `requiresAggregation(serviceId, jobIndex)` returns `true`. Operators sign results individually off-chain, an aggregator combines signatures, then submits via `submitAggregatedResult`.

**Hook sequence:**
1. `onJobCall` -- called when job is submitted
2. (Off-chain: operators sign, aggregator collects)
3. `onAggregatedResult` -- called when aggregated result is submitted (notification)

**Key differences from standard:**
- `submitResult` reverts with `AggregationRequired` for aggregation jobs
- Threshold is enforced via signer bitmap (count-based or stake-weighted)
- BLS signature is verified on-chain against registered operator pubkeys
- BSM controls threshold via `getAggregationThreshold`

**Source:** [tnt-core/src/core/JobsAggregation.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/JobsAggregation.sol)

### RFQ (Request for Quote) Jobs

Operators provide signed price quotes off-chain. The caller collects quotes and submits via `submitJobFromQuote` with an array of `SignedJobQuote` structs.

**Hook sequence:**
1. Caller collects EIP-712 signed quotes from operators
2. `onJobCall` -- called when job is submitted with quotes
3. Only quoted operators can submit results
4. `onJobResult` -- called for each result
5. Payment is distributed per-operator at their quoted price

**Key differences:**
- Each operator prices independently (no uniform payment)
- `job.isRFQ = true` -- payment distribution uses quoted prices
- Only operators in the quote set can submit results

**Source:** [tnt-core/src/core/JobsRFQ.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/JobsRFQ.sol)

---

## 5. Payment Models

Defined in `Types.PricingModel`:

```solidity
enum PricingModel {
    PayOnce,      // 0: Single payment at service request
    Subscription, // 1: Recurring payments per interval
    EventDriven   // 2: Payment per job/event
}
```

### PayOnce

Payment is collected at `requestService` time. The full `paymentAmount` is taken upfront. Distribution happens when the service is activated (all operators approve).

### Subscription

- Payment goes into an escrow (`_serviceEscrows[serviceId]`) at request time
- Anyone can call `billSubscription(serviceId)` to trigger a billing cycle
- Each cycle releases `subscriptionRate` from escrow and distributes it
- Service owner can top up escrow via `fundService(serviceId, amount)`
- If escrow runs dry, anyone can call `terminateServiceForNonPayment` after the grace period
- Grace period is controlled by `getNonPaymentTerminationPolicy` (default: 1 interval, max: 12)

### EventDriven

- No upfront payment required at service request
- Payment is collected per-job at `submitJob` time
- Job price is either per-job rate (`_jobEventRates[blueprintId][jobIndex]`) or the blueprint's default `eventRate`
- Currently native-token only (`paymentToken` must be `address(0)`)

### Payment distribution split

All payment models distribute using a configurable split:

```
developerBps + protocolBps + operatorBps + stakerBps = 10000 (100%)
```

- **Developer share** goes to `queryDeveloperPaymentAddress(serviceId)` (default: `blueprintOwner`)
- **Protocol share** goes to the treasury
- **Operator share** distributed proportionally by effective exposure
- **Staker share** forwarded to `ServiceFeeDistributor` for delegator rewards

**Source:** [tnt-core/src/core/Payments.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/Payments.sol)

---

## 6. Slashing Flow

### Propose

Anyone authorized (service owner, blueprint owner, or `querySlashingOrigin(serviceId)`) calls `proposeSlash`:

```solidity
function proposeSlash(
    uint64 serviceId,
    address operator,
    uint16 slashBps,    // 0-10000 basis points
    bytes32 evidence    // e.g., IPFS CID
) external returns (uint64 slashId);
```

**Hook fired:** `onUnappliedSlash(serviceId, abi.encodePacked(operator), slashPercent)` via `_tryCallManager`.

### Dispute window

The slashed operator (or `SLASH_ADMIN_ROLE`) can call `disputeSlash(slashId, reason)` during the dispute window. The dispute origin is checked via `queryDisputeOrigin(serviceId)`.

### Execute

After the dispute window passes, anyone calls `executeSlash(slashId)`:
- Actual stake is slashed via `_staking.slashForBlueprint`
- Only delegators exposed to the specific blueprint are affected

**Hook fired:** `onSlash(serviceId, abi.encodePacked(operator), slashPercent)` via `_tryCallManager`.

### Cancel

`SLASH_ADMIN_ROLE` can cancel a pending slash via `cancelSlash(slashId, reason)`.

**Source:** [tnt-core/src/core/Slashing.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/Slashing.sol)

---

## 7. Dynamic vs Fixed Membership

```solidity
enum MembershipModel {
    Fixed,   // 0: Operators locked at service creation
    Dynamic  // 1: Operators can join/leave after activation
}
```

### Fixed membership

Operators are specified in the service request. All must approve. Once the service is active, the operator set cannot change.

### Dynamic membership

Operators can join via `joinService(serviceId, exposureBps)` and leave via the exit queue system.

**Join flow:**
1. Operator calls `joinService`
2. Core checks: service is active, dynamic model, operator is registered, meets stake requirements
3. Core calls `canJoin(serviceId, operator)` on BSM -- if `false`, join is rejected
4. Operator is added to service
5. Core calls `onOperatorJoined(serviceId, operator, exposureBps)` on BSM

**Exit queue system:**
1. Operator calls `scheduleExit(serviceId)` -- BSM's `getExitConfig` determines timing
2. Core fires `onExitScheduled(serviceId, operator, executeAfter)`
3. After `exitQueueDuration` passes, operator calls `executeExit(serviceId)`
4. Core calls `canLeave(serviceId, operator)` -- if `false`, exit is blocked
5. Core fires `onOperatorLeft(serviceId, operator)`

**Exit config parameters:**
- `minCommitmentDuration` -- minimum time after joining before exit can be scheduled (seconds)
- `exitQueueDuration` -- time between scheduling and executing exit (seconds)
- `forceExitAllowed` -- whether service owner can force-exit operators

**Convenience:** `leaveService(serviceId)` combines schedule+execute but only works if `exitQueueDuration == 0`.

**Emergency:** `forceRemoveOperator(serviceId, operator)` is callable only by the BSM contract itself, bypasses all checks.

**Source:** [tnt-core/src/core/ServicesLifecycle.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/ServicesLifecycle.sol)

---

## 8. MBSM Versioning

The **MBSMRegistry** manages versions of the Master Blueprint Service Manager. It is a UUPS-upgradeable contract with role-based access control.

**Key concepts:**
- Revisions are 1-indexed. Each `addVersion(mbsmAddress)` increments the revision counter.
- Blueprints can **pin** to a specific revision for stability, or use **latest** (default).
- Deprecated versions go through a grace period (default 7 days) before being fully removed.

**Blueprint pinning:**

```solidity
// Get the MBSM for a blueprint (pinned or latest)
function getMBSM(uint64 blueprintId) external view returns (address);

// Pin a blueprint to a specific revision
function pinBlueprint(uint64 blueprintId, uint32 revision) external;

// Unpin to use latest
function unpinBlueprint(uint64 blueprintId) external;
```

**Deprecation flow:**
1. `initiateDeprecation(revision)` -- starts grace period
2. Wait for `deprecationGracePeriod` (minimum 1 day, default 7 days)
3. `completeDeprecation(revision)` -- sets version to `address(0)`
4. Emergency: `deprecateVersion(revision)` -- immediate deprecation

**Source:** [tnt-core/src/MBSMRegistry.sol](https://github.com/tangle-network/tnt-core/blob/main/src/MBSMRegistry.sol), [tnt-core/src/MasterBlueprintServiceManager.sol](https://github.com/tangle-network/tnt-core/blob/main/src/MasterBlueprintServiceManager.sol)

---

## 9. Permitted Callers

Service owners control who can submit jobs via **permitted callers**:

```solidity
// On TangleCore (not on the BSM):
function addPermittedCaller(uint64 serviceId, address caller) external;
function removePermittedCaller(uint64 serviceId, address caller) external;
```

Only the service owner can add/remove permitted callers. The initial set is specified in the `requestService` call and passed to the BSM via `onServiceInitialized(..., permittedCallers, ...)`.

Job submission (`submitJob`, `submitJobFromQuote`) checks `_permittedCallers[serviceId].contains(caller)` and reverts with `NotPermittedCaller` if the caller is not in the set.

**Source:** [tnt-core/src/core/ServicesLifecycle.sol](https://github.com/tangle-network/tnt-core/blob/main/src/core/ServicesLifecycle.sol) (lines 158-173)

---

## 10. MockBSM Examples -- Three Levels of Complexity

**Source:** [tnt-core/test/blueprints/mocks/MockBSM.sol](https://github.com/tangle-network/tnt-core/blob/main/test/blueprints/mocks/MockBSM.sol)

### Level 1: MockBSM_V1 -- Hook tracking

The simplest useful BSM. Inherits `BlueprintServiceManagerBase`, overrides every hook to increment counters and store data.

**Key patterns:**
- Tracks all hook call counts in a `HookCalls` struct
- Stores operator registration inputs, job inputs/outputs
- Overrides `getExitConfig` to allow immediate exits (no queue) for testing
- No validation logic -- accepts everything

```solidity
contract MockBSM_V1 is BlueprintServiceManagerBase {
    struct HookCalls {
        uint256 onBlueprintCreated;
        uint256 onRegister;
        // ... (tracks all hooks)
    }
    HookCalls public hookCalls;

    function onRegister(address operator, bytes calldata inputs)
        external payable virtual override onlyFromTangle
    {
        hookCalls.onRegister++;
        registeredOperators.push(operator);
        operatorRegistrationInputs[operator] = inputs;
    }

    // Override exit config for testing: no commitment/queue delays
    function getExitConfig(uint64) external pure virtual override
        returns (bool useDefault, uint64 minCommitmentDuration,
                 uint64 exitQueueDuration, bool forceExitAllowed)
    {
        return (false, 0, 0, false);
    }
}
```

### Level 2: MockBSM_V2 -- Validation and custom configs

Adds operator allowlist, minimum payment enforcement, job index validation, and custom heartbeat/slashing windows.

**Key patterns:**
- `operatorAllowlistEnabled` + `allowedOperators` mapping for gating `onRegister`
- `minimumPayment` check in `onRequest`
- Per-service `customHeartbeatIntervals` and `customSlashingWindows`
- `maxJobIndex` validation in `onJobCall`

```solidity
contract MockBSM_V2 is MockBSM_V1 {
    mapping(address => bool) public allowedOperators;
    bool public operatorAllowlistEnabled;

    function onRegister(address operator, bytes calldata inputs)
        external payable override onlyFromTangle
    {
        if (operatorAllowlistEnabled && !allowedOperators[operator]) {
            revert OperatorNotAllowed(operator);
        }
        // ... tracking
    }

    function getHeartbeatInterval(uint64 serviceId)
        external view override returns (bool useDefault, uint64 interval)
    {
        if (customHeartbeatIntervals[serviceId] > 0) {
            return (false, customHeartbeatIntervals[serviceId]);
        }
        return (true, 0);
    }
}
```

### Level 3: MockBSM_V3 -- Full-featured BSM

Adds custom slashing/dispute authorities, per-service developer payment addresses, membership controls (block join/leave), custom result quorum requirements, and active service tracking.

**Key patterns:**
- `customSlashingOrigins` / `customDisputeOrigins` per service
- `customDeveloperAddresses` per service for payment routing
- `blockedFromJoining` / `blockedFromLeaving` for fine-grained membership control
- `customResultCounts` for per-job quorum requirements
- `serviceActive` state tracking from `onServiceInitialized` / `onServiceTermination`

```solidity
contract MockBSM_V3 is MockBSM_V2 {
    mapping(uint64 => address) public customSlashingOrigins;
    mapping(uint64 => mapping(address => bool)) public blockedFromJoining;

    function canJoin(uint64 serviceId, address operator) external view override returns (bool) {
        return !blockedFromJoining[serviceId][operator];
    }

    function querySlashingOrigin(uint64 serviceId) external view override returns (address) {
        if (customSlashingOrigins[serviceId] != address(0)) {
            return customSlashingOrigins[serviceId];
        }
        return address(this);
    }

    function getRequiredResultCount(uint64 serviceId, uint8 jobIndex)
        external view override returns (uint32)
    {
        if (customResultCounts[serviceId][jobIndex] > 0) {
            return customResultCounts[serviceId][jobIndex];
        }
        return 1;
    }
}
```

---

## 11. Production BSM Example: AgentSandboxBlueprint

**Source:** [ai-agent-sandbox-blueprint/contracts/src/AgentSandboxBlueprint.sol](https://github.com/tangle-network/ai-agent-sandbox-blueprint/blob/main/contracts/src/AgentSandboxBlueprint.sol)

The AI Agent Sandbox Blueprint is a production BSM that demonstrates real-world patterns. It extends `OperatorSelectionBase` (which itself extends `BlueprintServiceManagerBase`) and is deployed in three modes: cloud, instance, and TEE instance.

### Architecture

```
BlueprintServiceManagerBase
  OperatorSelectionBase        -- Deterministic operator selection using restaking data
    AgentSandboxBlueprint      -- Application-specific logic
```

### Hooks overridden

| Hook | What it does |
|------|-------------|
| `onRegister` | Parses `registrationInputs` as `uint32` capacity; stores per-operator `operatorMaxCapacity` |
| `onUnregister` | Blocks unregistration if operator has `operatorActiveSandboxes > 0` |
| `onRequest` | In cloud mode: validates operator selection via `OperatorSelectionBase`. In instance mode: stores sandbox config |
| `onServiceInitialized` | Stores `serviceOwner` and moves pending config to `serviceConfig[serviceId]` |
| `onServiceTermination` | Clears provisioned operators and decrements capacity counters |
| `onOperatorLeft` | Clears provision state when an operator leaves |
| `onJobCall` | In cloud mode: assigns operators weighted by capacity, validates sandbox state. In instance mode: validates operator is provisioned |
| `onJobResult` | In cloud mode: processes sandbox create/delete results (tracks `sandboxActive`). In instance mode: processes provision/deprovision lifecycle |

### Notable patterns

**Operator capacity management:**
```solidity
function onRegister(address operator, bytes calldata registrationInputs)
    external payable override onlyFromTangle
{
    uint32 capacity = registrationInputs.length >= 32
        ? abi.decode(registrationInputs, (uint32))
        : 0;
    operatorMaxCapacity[operator] = capacity > 0 ? capacity : defaultMaxCapacity;
}
```

**Blocking unregistration while active:**
```solidity
function onUnregister(address operator) external virtual override onlyFromTangle {
    if (operatorActiveSandboxes[operator] != 0) revert CannotLeaveWithActiveResources();
}
```

**Deterministic operator selection** via `OperatorSelectionBase`:
- Uses `IMultiAssetDelegation` (restaking) to enumerate eligible operators
- Supports seed-based deterministic selection for reproducible assignments
- Validates operator eligibility against the registered blueprint

**Source:** [ai-agent-sandbox-blueprint/contracts/src/OperatorSelection.sol](https://github.com/tangle-network/ai-agent-sandbox-blueprint/blob/main/contracts/src/OperatorSelection.sol)

---

## Quick Reference: What Must a Blueprint Dev Implement?

### Minimum viable BSM (zero overrides needed)

```solidity
contract MinimalBSM is BlueprintServiceManagerBase {
    // Everything works with defaults:
    // - All operators accepted
    // - All service requests accepted
    // - All jobs accepted
    // - Single result completes a job
    // - Protocol default timing for everything
    // - Blueprint owner gets developer payment share
    // - Native token always allowed for payment
}
```

### Common overrides by priority

1. **`onRegister`** -- Almost always. Gate operator quality.
2. **`onRequest`** -- Usually. Validate service configurations and payment amounts.
3. **`onServiceInitialized`** -- Usually. Initialize per-service state.
4. **`onJobCall`** / **`onJobResult`** -- Usually. Application-specific job logic.
5. **`onServiceTermination`** -- Often. Clean up per-service state.
6. **`getExitConfig`** -- If using dynamic membership. Set commitment/exit timing.
7. **`canJoin`** / **`canLeave`** -- If using dynamic membership with custom gatekeeping.
8. **`queryDeveloperPaymentAddress`** -- If revenue needs per-service routing.
9. **`getRequiredResultCount`** -- If jobs need multi-operator consensus.
10. **`requiresAggregation`** + **`getAggregationThreshold`** -- If using BLS aggregation.
