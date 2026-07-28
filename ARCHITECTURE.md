# ADR-001: Feature Flag Management System — Architecture

**Status:** Proposed  
**Date:** 2026-07-28  
**Authors:** Platform Engineering  
**Reviewers:** SRE, Support Engineering, Security

---

## Context

Feature assignments are scattered across multiple systems, poorly documented, and difficult to audit. Support engineers and internal engineers need a deterministic, auditable way to manage feature flags per customer. This is an **internal engineering tool**, not customer-facing.

**Primary users:** Support Engineers, SREs, Productivity Engineers.

**Core operations:**

1. Enable a feature for a customer
2. Disable a feature
3. List all features for a customer
4. List all customers using a feature
5. Track who changed what
6. Roll back changes

---

## 1. Overall System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        CLI Layer                         │
│  (Commander.js + Zod validation + table output)         │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────┐
│                     API Layer                            │
│  (Express.js + Zod schemas + JWT auth middleware)        │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   Service Layer                          │
│  (Business logic, RBAC enforcement, audit logging)       │
└──────────┬───────────────────────────┬──────────────────┘
           │                           │
┌──────────▼──────────┐   ┌───────────▼──────────────────┐
│  Repository Layer   │   │      Audit Log Store          │
│  (Prisma Client)    │   │  (PostgreSQL — same DB)       │
└──────────┬──────────┘   └───────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│               PostgreSQL (Prisma ORM)                    │
│  [customers] [features] [assignments] [users] [audit]   │
└─────────────────────────────────────────────────────────┘
```

### Rationale

| Decision | Why | Advantages | Trade-offs | Alternatives Considered |
|---|---|---|---|---|
| **Monolith (API + CLI share service layer)** | Internal tool with modest scale. Single deployment unit. | Simple ops, shared types, one DB connection pool, easy debugging. | Can't scale API and CLI independently (irrelevant at this scale). | Microservices (massive over-engineering for an internal tool). |
| **Shared PostgreSQL for data + audit** | Audit log is part of the same transactional boundary as the mutation. | Atomicity: flag change + audit record written in one transaction. Can't have audit gaps. | Single DB to operate. | Separate audit store (e.g., S3 + Athena) — adds complexity, breaks atomicity. |
| **Express.js for API** | Mature, well-understood, zero learning curve for the team. | Huge middleware ecosystem, trivial to add rate limiting/logging. | Slightly more boilerplate than Fastify. | Fastify (benchmarks faster but team has no experience, no meaningful perf difference at this scale). |
| **CLI calls the API over HTTP** | CLI is a thin client. No direct DB access from CLI. | Single source of truth (API), consistent auth/RBAC for all callers. | Requires network access. | CLI using Prisma directly — bypasses auth, duplicates logic, different behavior than API. |

---

## 2. Folder Structure

```
feature-flag-manager/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── index.ts                    # API entry point (Express bootstrap)
│   ├── cli.ts                      # CLI entry point (Commander bootstrap)
│   │
│   ├── config/
│   │   ├── env.ts                  # Zod-validated environment config
│   │   └── constants.ts            # App-wide constants (RBAC roles, etc.)
│   │
│   ├── domain/
│   │   ├── customer.ts             # Customer domain types
│   │   ├── feature.ts              # Feature domain types
│   │   ├── assignment.ts           # Assignment domain types
│   │   ├── user.ts                 # User domain types
│   │   └── audit.ts                # Audit log domain types
│   │
│   ├── repositories/
│   │   ├── customer.repository.ts  # Customer DB operations
│   │   ├── feature.repository.ts   # Feature DB operations
│   │   ├── assignment.repository.ts # Assignment DB operations
│   │   ├── user.repository.ts      # User DB operations
│   │   ├── api-key.repository.ts   # API key DB operations
│   │   └── audit.repository.ts     # Audit log DB operations
│   │
│   ├── services/
│   │   ├── customer.service.ts
│   │   ├── feature.service.ts
│   │   ├── assignment.service.ts
│   │   ├── user.service.ts
│   │   ├── api-key.service.ts
│   │   └── audit.service.ts
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── customer.routes.ts
│   │   │   ├── feature.routes.ts
│   │   │   ├── assignment.routes.ts
│   │   │   └── user.routes.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT verification
│   │   │   ├── rbac.ts             # Role-based access control
│   │   │   ├── validate.ts         # Zod request validation
│   │   │   ├── rate-limit.ts       # Rate limiting (express-rate-limit)
│   │   │   ├── error-handler.ts    # Global error handler
│   │   │   └── request-logger.ts   # HTTP request logging
│   │   └── schemas/
│   │       ├── customer.schema.ts  # Zod request/response schemas
│   │       ├── feature.schema.ts
│   │       ├── assignment.schema.ts
│   │       └── user.schema.ts
│   │
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── customer.commands.ts
│   │   │   ├── feature.commands.ts
│   │   │   ├── assignment.commands.ts
│   │   │   └── auth.commands.ts    # `ffm login`, `ffm whoami`
│   │   └── output.ts              # Table/formatting helpers
│   │
│   ├── lib/
│   │   ├── prisma.ts               # Prisma client singleton
│   │   ├── errors.ts               # Custom error classes
│   │   ├── logger.ts               # Structured logger (pino)
│   │   └── crypto.ts               # Token generation, hashing
│   │
│   └── types/
│       └── index.ts                # Shared TypeScript types/interfaces
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   └── repositories/
│   ├── integration/
│   │   ├── api/
│   │   └── repositories/
│   └── fixtures/
│       └── seed.ts                 # Test data factories
│
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.cli
│   └── docker-compose.yml
│
├── .env.example
├── .gitignore
├── tsconfig.json
├── package.json
├── vitest.config.ts
└── README.md
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Domain types separate from Prisma models** | Decouples business logic from ORM. Prisma types leak `id` as `string` always; domain types can use branded types (`CustomerId`). Repository maps Prisma → Domain. | Extra mapping layer. Acceptable for correctness. |
| **Schemas collocated with API routes** | Zod schemas for request validation live next to the routes that use them. | Slightly harder to share schemas between API and CLI. CLI uses service layer directly with typed inputs, so this is fine. |
| **CLI as separate entry point** | `cli.ts` and `index.ts` are distinct. Published as different `bin` entries or run via `npx ffm`. | Two entry points to maintain. Acceptable since they share all business logic. |

---

## 3. Database Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  SUPPORT_ENGINEER
  SRE
  VIEWER
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  name          String
  role          Role     @default(VIEWER)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  apiKeys       ApiKey[]
  auditLogs     AuditLog[]

  @@map("users")
}

model ApiKey {
  id          String    @id @default(cuid())
  userId      String
  hash        String    @unique          // bcrypt hash of the API key
  label       String                     // Human-readable label (e.g. "CI/CD prod pipeline")
  expiresAt   DateTime?                  // null = never expires
  revokedAt   DateTime?                  // null = not revoked
  lastUsedAt  DateTime?                  // Tracks last usage for rotation reminders
  createdAt   DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([hash])
  @@map("api_keys")
}

model Customer {
  id          String       @id @default(cuid())
  name        String       @unique
  externalId  String?      @unique    // Customer's own ID from their system
  description String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  assignments Assignment[]

  @@index([name])
  @@map("customers")
}

model Feature {
  id          String       @id @default(cuid())
  key         String       @unique    // e.g. "advanced-analytics", "beta-dashboard"
  name        String                   // Human-readable name
  description String?
  enabled     Boolean      @default(false)  // Global default
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  assignments Assignment[]

  @@index([key])
  @@map("features")
}

model Assignment {
  id         String   @id @default(cuid())
  enabled    Boolean
  customerId String
  featureId  String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  feature  Feature  @relation(fields: [featureId], references: [id], onDelete: Cascade)

  @@unique([customerId, featureId])
  @@index([customerId])
  @@index([featureId])
  @@map("assignments")
}

model AuditLog {
  id         String   @id @default(cuid())
  action     String                    // "ENABLE" | "DISABLE" | "CREATE" | "DELETE" | "UPDATE"
  entityType String                    // "FEATURE" | "CUSTOMER" | "ASSIGNMENT" | "USER"
  entityId   String
  userId     String?
  details    Json                      // Previous + new values
  ipAddress  String?
  createdAt  DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt(sort: Desc)])
  @@map("audit_logs")
}

model RefreshToken {
  id        String   @id @default(cuid())
  tokenHash String   @unique          // SHA-256 hash of the refresh token
  userId    String
  expiresAt DateTime                  // e.g. 30 days from creation
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@index([userId])
  @@map("refresh_tokens")
}
```

### Entity Relationship Diagram

```
┌──────────┐       ┌──────────────┐       ┌──────────┐
│ Customer │──1:N──│  Assignment  │──N:1──│ Feature  │
└──────────┘       └──────────────┘       └──────────┘
                        │
                        │N:1 (optional)
                        ▼
                   ┌──────────┐
                   │   User   │
                   └─────┬────┘
                    1:N  │  1:N  1:N
                  ┌──────┼──────┐
                  ▼      ▼      ▼
             ┌──────────┐ ┌──────────┐ ┌────────────┐
             │ AuditLog │ │  ApiKey  │ │RefreshToken│
             └──────────┘ └──────────┘ └────────────┘
```

### Rationale

| Decision | Why | Trade-offs | Alternatives |
|---|---|---|---|
| **`cuid()` for primary keys** | URL-safe, collision-resistant, no DB coordination needed, sortable by creation time. | Not sequential (slightly larger indexes than `serial`). Acceptable. | `uuid` (no ordering), `serial` (requires DB coordination, leaks creation order). |
| **`Assignment` as join table with `enabled` flag** | A customer can have a feature explicitly enabled OR disabled, overriding the global default. Three-state logic: `assignment exists + enabled=true`, `assignment exists + enabled=false`, `no assignment (use global default)`. | Requires careful query logic for "is feature X on for customer Y?". Documented in service layer. | Boolean columns on Customer (doesn't scale, N features = N columns). JSON blob (can't query efficiently). |
| **Unique constraint on `[customerId, featureId]`** | Prevents duplicate assignments. Database-level invariant. | One assignment per customer-feature pair (correct behavior). | Compound unique indexes without explicit constraint (same thing, less clear). |
| **Audit log as JSON `details` column** | Flexible schema for before/after values. PostgreSQL `json` type is sufficient (no need for `jsonb` indexing since we query by `entityType`/`entityId`/`createdAt`). | Can't query inside `details` efficiently. Acceptable — audit logs are read by entity, not searched by value. | Separate columns per field (rigid, requires schema changes for every entity type). |
| **`onDelete: Cascade` on Assignment** | Deleting a customer or feature removes its assignments automatically. | Accidental customer deletion removes audit trail associations. Mitigated by soft-deletes if needed (see Future Improvements). | `onDelete: Restrict` (forces manual cleanup, more safe but more work). |

### Key Query Patterns

```sql
-- "Is feature X enabled for customer Y?"
-- 1. Check for explicit assignment
SELECT enabled FROM assignments
WHERE customerId = ? AND featureId = ?

-- 2. If no row, fall back to feature.globalDefault

-- "List all features for customer Y"
SELECT f.*, a.enabled AS assignmentEnabled
FROM features f
LEFT JOIN assignments a ON a.featureId = f.id AND a.customerId = ?

-- "List all customers using feature X"
SELECT c.*, a.enabled
FROM customers c
INNER JOIN assignments a ON a.customerId = c.id AND a.featureId = ?
WHERE a.enabled = true
```

---

## 4. API Architecture

### Endpoint Design

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| `GET` | `/api/customers` | List customers (paginated: `limit`, `offset`) | VIEWER+ |
| `POST` | `/api/customers` | Create a customer | SUPPORT_ENGINEER+ |
| `GET` | `/api/customers/:id` | Get customer details | VIEWER+ |
| `DELETE` | `/api/customers/:id` | Delete a customer | ADMIN |
| `GET` | `/api/features` | List features (paginated: `limit`, `offset`) | VIEWER+ |
| `POST` | `/api/features` | Create a feature | SUPPORT_ENGINEER+ |
| `GET` | `/api/features/:id` | Get feature details | VIEWER+ |
| `PATCH` | `/api/features/:id` | Update feature (global default) | SUPPORT_ENGINEER+ |
| `DELETE` | `/api/features/:id` | Delete a feature | ADMIN |
| `GET` | `/api/features/:id/customers` | List customers for a feature | VIEWER+ |
| `GET` | `/api/customers/:id/features` | List features for a customer | VIEWER+ |
| `PUT` | `/api/customers/:id/features/:featureId` | Enable/disable feature for customer | SUPPORT_ENGINEER+ |
| `DELETE` | `/api/customers/:id/features/:featureId` | Remove assignment (revert to global) | SUPPORT_ENGINEER+ |
| `GET` | `/api/audit` | List audit log entries (filterable) | SRE+ |
| `POST` | `/api/auth/login` | Exchange credentials for JWT | Public |
| `GET` | `/api/auth/me` | Get current user info | Any authenticated |
| `POST` | `/api/auth/api-keys` | Create a new API key | Any authenticated |
| `GET` | `/api/auth/api-keys` | List current user's API keys | Any authenticated |
| `DELETE` | `/api/auth/api-keys/:id` | Revoke an API key | Any authenticated |

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **REST (not GraphQL)** | Internal tool with simple CRUD. REST is universally understood, cachable, and debuggable with `curl`. | No over-fetching control. Irrelevant — response payloads are small. |
| **`PUT` for assignment (idempotent)** | "Enable feature X for customer Y" is idempotent. `PUT` with `enabled: true/false` in body. Retries are safe. | No partial update semantics. Correct — assignment is a boolean toggle. |
| **Nested resources for reads** | `GET /customers/:id/features` and `GET /features/:id/customers` are natural navigational paths. | Two ways to query the same data. Feature is that both are useful in different workflows. |
| **Versioned API path (`/api/`)** | Clear separation from health checks (`/health`), metrics (`/metrics`). Future ability to add `/api/v2/`. | Slightly longer URLs. Negligible. |
| **Per-user rate limiting on mutations** | `express-rate-limit` keyed on `req.user.id`. Assignment mutations are limited to 60/minute per user. Prevents runaway scripts or accidental bulk operations without blocking read endpoints. | In-memory store by default; use Redis adapter if running multiple replicas. |

### Request/Response Schemas (Zod)

```typescript
// Example: assignment request
const EnableFeatureSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().min(1).max(500),  // Required for audit trail
});

// Example: feature create
const CreateFeatureSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().default(false),
});

// Example: audit query
const AuditQuerySchema = z.object({
  entityType: z.enum(["FEATURE", "CUSTOMER", "ASSIGNMENT", "USER"]).optional(),
  entityId: z.string().optional(),
  userId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Pagination params (shared across list endpoints)
const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Paginated response wrapper (used by customers, features, audit)
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
```

---

## 5. CLI Architecture

### Command Structure

```
ffm (Feature Flag Manager)

USAGE
  ffm <command> [options]

COMMANDS
  # Authentication
  ffm login                  # Authenticate via email/password, store JWT
  ffm whoami                 # Show current authenticated user
  ffm auth create-key <label> [--expires-in 30d]  # Create API key (shown once)
  ffm auth revoke-key <key-id>                      # Revoke an API key
  ffm auth list-keys                               # List current user's API keys

  # Customers
  ffm customer list [--limit N] [--offset N]       # List all customers (paginated)
  ffm customer create <name> [--ext-id ID]         # Create a customer
  ffm customer get <id-or-name>                    # Get customer details
  ffm customer delete <id-or-name>                 # Delete a customer (requires --confirm)

  # Features
  ffm feature list [--limit N] [--offset N]        # List all features (paginated)
  ffm feature create <key> --name <name> [--description]  # Create a feature
  ffm feature get <key-or-id>                      # Get feature details
  ffm feature delete <key-or-id>                   # Delete (requires --confirm)

  # Assignments
  ffm enable  <feature> <customer> [--reason TEXT]  # Enable feature for customer
  ffm disable <feature> <customer> [--reason TEXT]  # Disable feature for customer
  ffm status <customer>                             # Show all feature statuses for a customer
  ffm whohas <feature>                              # Show all customers with a feature

  # Audit
  ffm audit [--entity-type TYPE] [--entity-id ID] [--from DATE] [--to DATE] [--limit N]

OPTIONS
  --format <format>    Output format: table (default), json, csv
  --no-color           Disable colored output
  --verbose            Enable verbose logging
  -h, --help           Display help
  -V, --version        Display version
```

### CLI ↔ API Communication

```
┌──────────┐   HTTP/S    ┌──────────┐   Prisma   ┌──────────┐
│   CLI    │ ──────────▶ │   API    │ ──────────▶ │ Postgres │
│(thin)    │ ◀────────── │ (Express)│ ◀────────── │          │
└──────────┘   JSON      └──────────┘             └──────────┘
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **CLI as thin HTTP client** | CLI sends authenticated HTTP requests to the API. No direct DB access. | Requires API to be running. Network dependency. |
| **`ffm login` stores JWT + refresh token in `~/.config/ffm/`** | Standard pattern for CLI tools. Files are user-local, excluded from version control. | Refresh token expires after 30 days. Access token auto-refreshes transparently on 401. User only re-logs in if refresh token expires. |
| **`--reason` required on mutations** | Every `enable`/`disable` requires a human-readable reason. Stored in audit log. | Slightly more typing. Acceptable — forces thoughtful changes. |
| **`--confirm` on destructive commands** | `delete` commands require `--confirm` flag to prevent accidental deletion. | Extra flag. Necessary safety guard. |
| **Multiple output formats (`--format`)** | `table` for humans, `json` for scripting/piping, `csv` for spreadsheets. | Three formatters to maintain. Simple enough with `cli.output.ts`. |
| **Name-or-ID resolution** | Commands like `ffm customer get` accept either customer ID or name. Service resolves to ID. | Ambiguity if two customers share similar names. Uniqueness constraint on name prevents exact duplicates. |

---

## 6. Service Layer

```typescript
// Pseudocode — not implementation

// AssignmentService
class AssignmentService {
  // Core business logic: enable/disable feature for customer
  async enableFeature(params: {
    customerId: string;
    featureId: string;
    enabledBy: string;    // userId
    reason: string;
  }): Promise<Assignment>

  async disableFeature(params: {
    customerId: string;
    featureId: string;
    disabledBy: string;
    reason: string;
  }): Promise<Assignment>

  async getFeatureStatus(customerId: string, featureId: string): Promise<{
    enabled: boolean;
    source: 'assignment' | 'global_default';
  }>

  async getCustomerFeatures(customerId: string): Promise<CustomerFeatureStatus[]>

  async getFeatureCustomers(featureId: string): Promise<CustomerFeatureStatus[]>

  async removeAssignment(params: {
    customerId: string;
    featureId: string;
    removedBy: string;
    reason: string;
  }): Promise<void>
}

// ApiKeyService
class ApiKeyService {
  async createKey(params: {
    userId: string;
    label: string;
    expiresInDays?: number;  // null/undefined = no expiry
  }): Promise<ApiKeyCreated>  // Returns raw key once

  async listKeys(userId: string): Promise<ApiKey[]>  // Never returns raw key

  async revokeKey(params: {
    keyId: string;
    userId: string;  // Ensures user can only revoke their own keys
  }): Promise<void>

  // Used by auth middleware
  async authenticateByKey(rawKey: string): Promise<User | null>  // Returns null if invalid/expired/revoked
}
```

### Service Layer Responsibilities

1. **Input validation** — Zod schemas validate inputs before business logic runs.
2. **RBAC enforcement** — Services check user roles. (API middleware does this pre-flight; CLI relies on API.)
3. **Business rule enforcement** — e.g., feature keys must match pattern, names must be unique.
4. **Transaction wrapping** — Assignment mutation + audit log write in a single `$transaction`.
5. **Audit logging** — Every mutation writes an `AuditLog` entry with before/after values and the acting user.
6. **Error translation** — Repository errors (constraint violations) become user-friendly `DomainError` subclasses.

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Services own transactions** | Repositories are thin CRUD. Services compose multiple repository calls atomically. | Service layer is heavier. Correct for audit integrity. |
| **Audit logging in service layer (not middleware)** | Services have the full context to write accurate before/after diffs. Middleware only sees the request, not the DB state. | Audit code in every service method. Abstracted via `auditService.log()` helper. |
| **`DomainError` hierarchy** | Typed errors (`CustomerNotFoundError`, `FeatureAlreadyEnabledError`, `InsufficientPermissionsError`) let API and CLI produce precise error messages. | More error classes to define upfront. Worth it for clarity. |

---

## 7. Repository Layer

```typescript
// Pseudocode

class AssignmentRepository {
  async find(customerId: string, featureId: string): Promise<Assignment | null>
  async findByCustomer(customerId: string): Promise<AssignmentWithFeature[]>
  async findByFeature(featureId: string): Promise<AssignmentWithCustomer[]>
  async upsert(customerId: string, featureId: string, enabled: boolean): Promise<Assignment>
  async delete(customerId: string, featureId: string): Promise<void>

  // Maps Prisma model → Domain model
  private toDomain(prismaAssignment: PrismaAssignment): Assignment
}

class ApiKeyRepository {
  async create(userId: string, hash: string, label: string, expiresAt: Date | null): Promise<ApiKey>
  async findByHash(hash: string): Promise<ApiKeyWithUser | null>    // For auth lookup
  async findByUser(userId: string): Promise<ApiKey[]>               // List user's keys
  async revoke(id: string, userId: string): Promise<void>           // Sets revokedAt
  async updateLastUsed(id: string): Promise<void>                   // Updates lastUsedAt
  async deleteExpired(): Promise<number>                            // Cleanup job

  private toDomain(prismaApiKey: PrismaApiKey): ApiKey
}
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Repositories are thin** | They do Prisma queries + type mapping. No business logic. | Extra layer. Makes services testable (mock repositories). |
| **`toDomain()` mapping in each repository** | Prisma types leak ORM details. Domain types use branded IDs and proper enums. | Mapping boilerplate. Acceptable for type safety. |
| **No generic base repository** | Each repository is specific. Generic repos add complexity without value at this scale. | Copy-paste of CRUD patterns. Fine for 4-5 entities. |

---

## 8. Domain Models

```typescript
// Branded types for type safety
type CustomerId = string & { readonly __brand: 'CustomerId' };
type FeatureId = string & { readonly __brand: 'FeatureId' };
type UserId = string & { readonly __brand: 'UserId' };
type AssignmentId = string & { readonly __brand: 'AssignmentId' };
type ApiKeyId = string & { readonly __brand: 'ApiKeyId' };

interface Customer {
  id: CustomerId;
  name: string;
  externalId: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Feature {
  id: FeatureId;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;  // Global default
  createdAt: Date;
  updatedAt: Date;
}

interface Assignment {
  id: AssignmentId;
  enabled: boolean;
  customerId: CustomerId;
  featureId: FeatureId;
  createdAt: Date;
  updatedAt: Date;
}

interface User {
  id: UserId;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

interface ApiKey {
  id: ApiKeyId;
  userId: UserId;
  label: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

// Represents a newly created API key (returned once, never stored in plaintext)
interface ApiKeyCreated extends ApiKey {
  rawKey: string;  // The plaintext key — shown once at creation, never persisted
}

enum Role {
  Admin = 'ADMIN',
  SupportEngineer = 'SUPPORT_ENGINEER',
  SRE = 'SRE',
  Viewer = 'VIEWER',
}

interface AuditEntry {
  id: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  userId: UserId | null;
  details: AuditDetails;
  ipAddress: string | null;
  createdAt: Date;
}

interface AuditDetails {
  previous?: Record<string, unknown>;
  current?: Record<string, unknown>;
  reason?: string;
}
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Branded types** | Prevent passing a `CustomerId` where a `FeatureId` is expected. Compile-time safety. | Requires casting from Prisma types. Done in repository `toDomain()`. |
| **Domain types independent of Prisma** | If ORM changes, domain types are unaffected. Services only see domain types. | Extra mapping layer. |
| **`AuditDetails` as `Record<string, unknown>`** | Flexible. Different entities have different fields. Audit log captures arbitrary before/after. | No compile-time safety for audit details. Acceptable — audit is append-only logging. |

---

## 9. Authentication

### Approach: JWT (CLI) + API Key (Automation)

```
┌─────────┐                          ┌─────────┐
│   CLI   │  1. ffm login            │   API   │
│         │ ────────────────────────▶ │         │
│         │     email + password      │         │
│         │ ◀──────────────────────── │         │
│         │     { token, user }       │         │
│         │                           │         │
│         │  2. Store JWT in          │         │
│         │     ~/.config/ffm/        │         │
│         │                           │         │
│         │  3. ffm feature list      │         │
│         │     Authorization: Bearer  │         │
│         │ ────────────────────────▶ │         │
│         │ ◀──────────────────────── │         │
│         │                           │         │
│         │  4. On 401 (expired):     │         │
│         │     Print "Session        │         │
│         │     expired. Run          │         │
│         │     ffm login."           │         │
│         │     and exit 1            │         │
└─────────┘                          └─────────┘
```

### Token Management

| Mechanism | Storage | Lifetime | Use Case |
|---|---|---|---|
| **JWT (access token)** | `~/.config/ffm/token` | 24 hours | CLI authenticated sessions |
| **API key** | Header `X-API-Key` | Configurable (default: no expiry) | CI/CD pipelines, automation scripts |

### API Key Model

API keys are stored as bcrypt hashes in the `api_keys` table. Each key belongs to a user and has:

- **label** — human-readable name (e.g., "CI/CD prod pipeline", "GitHub Actions staging")
- **expiresAt** — optional expiry; `null` means never expires
- **revokedAt** — timestamp when revoked; `null` means active
- **lastUsedAt** — updated on each use for rotation awareness

A user can have multiple active keys. Revoking a key is non-destructive (sets `revokedAt`). Auth middleware rejects keys where `revokedAt` is set or `expiresAt` has passed.

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **JWT for CLI sessions** | Stateless, standard, easy to verify. 24-hour expiry is pragmatic for an internal tool — long enough for a workday, short enough to limit exposure. | Token expires; user re-runs `ffm login`. Acceptable — no refresh token complexity. |
| **Multiple API keys per user** | Different pipelines/scripts need independent credentials. Keys can be revoked individually without affecting other consumers. | More keys to manage. Worth it for operational safety. |
| **API keys for automation** | CI/CD needs non-interactive auth. Keys can expire or be revoked independently. | Stored as bcrypt hashes. Shown once at creation — never recoverable. |
| **No OAuth/OIDC** | Internal tool. Users are company employees. SSO integration is a future improvement. | No centralized identity. Acceptable for v1. |
| **Password stored with `bcrypt`** | Industry standard for password hashing. | Slow by design (prevents brute force). |

### Implementation Notes

- `POST /api/auth/login` accepts `{ email, password }`, returns `{ token, user }`.
- JWT payload: `{ sub: userId, role: role, iat, exp }` (24-hour expiry).
- Auth middleware extracts user from JWT or API key, attaches to `req.user`.
- API key flow: `X-API-Key` header → hash with bcrypt → lookup in `api_keys` where `revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now())` → attach user to request.
- If a valid API key is found, `lastUsedAt` is updated (fire-and-forget, not blocking the response).
- CLI on 401: prints "Session expired. Run `ffm login` to re-authenticate." and exits with code 1.
- `POST /api/auth/api-keys` — create a new API key (returns plaintext once).
- `DELETE /api/auth/api-keys/:id` — revoke an API key (sets `revokedAt`).
- `GET /api/auth/api-keys` — list current user's API keys (without raw values).
- Login endpoint is the only public endpoint (besides `/health`).

---

## 10. Authorization (RBAC)

### Role Hierarchy

```
ADMIN                  Full access. Can delete customers/features. Can manage users.
SRE                    Read all. Mutate assignments. View audit logs. Cannot delete entities.
SUPPORT_ENGINEER       Read all. Mutate assignments. Cannot view audit logs. Cannot delete.
VIEWER                 Read-only. Cannot mutate anything.
```

### Permission Matrix

| Action | VIEWER | SUPPORT_ENGINEER | SRE | ADMIN |
|---|:---:|:---:|:---:|:---:|
| List customers/features | ✅ | ✅ | ✅ | ✅ |
| View customer/feature details | ✅ | ✅ | ✅ | ✅ |
| Enable/disable feature | ❌ | ✅ | ✅ | ✅ |
| Create customer/feature | ❌ | ✅ | ✅ | ✅ |
| Delete customer/feature | ❌ | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ |

### Implementation

```typescript
// Middleware
function requireRole(...allowedRoles: Role[]) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Route usage
router.put('/customers/:id/features/:featureId',
  requireRole(Role.SupportEngineer, Role.SRE, Role.Admin),
  assignmentController.enable
);

router.get('/audit',
  requireRole(Role.SRE, Role.Admin),
  auditController.list
);
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Role-based (not attribute-based)** | 4 roles, simple hierarchy. ABAC is overkill. | Can't do per-feature or per-customer access control. Not needed for internal tool. |
| **Role on User (not per-request)** | Users have a single role. Consistent with company structure. | A support engineer can't be elevated for one operation. Requires admin to change role. |
| **Middleware-level enforcement** | First line of defense. Services also check as defense-in-depth. | Two places to maintain. Acceptable for security. |

---

## 11. Audit Logging

### What Gets Logged

Every mutation produces an audit entry:

```typescript
interface AuditEntry {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ENABLE' | 'DISABLE' | 'REMOVE_ASSIGNMENT';
  entityType: 'CUSTOMER' | 'FEATURE' | 'ASSIGNMENT' | 'USER';
  entityId: string;
  userId: string | null;
  details: {
    previous?: Record<string, unknown>;  // State before change
    current?: Record<string, unknown>;   // State after change
    reason?: string;                     // Required for ENABLE/DISABLE
  };
  ipAddress: string | null;
}
```

### Example Audit Entries

```json
{
  "action": "ENABLE",
  "entityType": "ASSIGNMENT",
  "entityId": "clx9abc...",
  "userId": "clx1def...",
  "details": {
    "previous": null,
    "current": {
      "customerId": "clx2ghi...",
      "customerName": "Customer A",
      "featureId": "clx3jkl...",
      "featureKey": "advanced-analytics",
      "enabled": true
    },
    "reason": "Requested by Customer A TAM for Q3 rollout"
  },
  "ipAddress": "10.0.1.42"
}
```

### Audit Log Writing (Atomic + Row-Locked)

```typescript
// In AssignmentService.enableFeature()
async enableFeature(params) {
  return this.prisma.$transaction(async (tx) => {
    // Lock the existing assignment row (if any) to prevent concurrent read races.
    // Prisma does not support FOR UPDATE natively, so we use $queryRaw.
    const lockedRows = await tx.$queryRaw<[{ id: string; enabled: boolean }[]]>`
      SELECT id, enabled FROM assignments
      WHERE "customerId" = ${params.customerId} AND "featureId" = ${params.featureId}
      FOR UPDATE
    `;
    const previous = lockedRows[0]?.[0] ?? null;

    const assignment = await tx.assignment.upsert({
      where: { customerId_featureId: { customerId: params.customerId, featureId: params.featureId } },
      update: { enabled: true },
      create: { customerId: params.customerId, featureId: params.featureId, enabled: true },
    });

    await tx.auditLog.create({
      data: {
        action: 'ENABLE',
        entityType: 'ASSIGNMENT',
        entityId: assignment.id,
        userId: params.enabledBy,
        details: { previous: previous ? { enabled: previous.enabled } : null, current: { enabled: true }, reason: params.reason },
        ipAddress: params.ipAddress,
      },
    });

    return assignment;
  });
}
```

The same `SELECT ... FOR UPDATE` pattern must be applied to `disableFeature` and `removeAssignment` — any mutation that reads previous state before writing.

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Atomic with mutation** | Audit log and data change in same transaction. If one fails, both roll back. No audit gaps. | Slightly slower writes (two inserts in transaction). Acceptable for correctness. |
| **`SELECT ... FOR UPDATE` for previous state** | Prevents concurrent read races where two requests read the same `previous` value before either commits. Row-level lock serializes concurrent mutations on the same customer/feature pair. | Uses `tx.$queryRaw` (Prisma lacks native `FOR UPDATE` support). Raw SQL is limited to this one locking query; all other queries use the Prisma client. | Serializable isolation level (causes more transaction-wide conflicts and retries with no benefit when only a single row needs serialization). |
| **JSON `details` with before/after** | Enables "what changed?" queries. Supports rollback (previous state is stored). | No indexing on JSON contents. Fine — audit is queried by entity/time, not by value. |
| **`reason` required for mutations** | Forces engineers to document intent. Creates natural changelog. | Extra typing. Worth it for traceability. |
| **Immutable (no update/delete)** | Audit logs are append-only. `DELETE` action is recorded, not executed on the log itself. | No way to correct mistakes in audit logs. Correct — they're the source of truth. |

---

## 12. Rollback Strategy

### Manual Rollback via Audit Log

```bash
# View recent changes
ffm audit --limit 5

# Output:
# ENABLE  ASSIGNMENT  clx9abc  2026-07-28  kai@example.com
#   feature: advanced-analytics  customer: Customer A
#   reason: "Requested for Q3 rollout"

# Rollback: disable the feature
ffm disable advanced-analytics "Customer A" --reason "Rollback: Q3 rollout cancelled"
```

### Programmatic Rollback (Future: CLI command)

```bash
ffm rollback <audit-log-id> --reason "Reverting change from ticket #1234"
```

This would:
1. Read the `details.previous` state from the audit log entry.
2. Apply the previous state (e.g., if the entry was `ENABLE`, rollback sets `enabled: false`).
3. Write a new audit log entry with `action: "ROLLBACK"` and link to the original entry.

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Audit log as rollback data source** | Every mutation stores the previous state. Rollback = reapply previous state. | Can't rollback if previous state was null (entity creation). Acceptable — creation rollback = deletion. |
| **Manual rollback in v1, programmatic later** | Manual is simpler. Engineers run `ffm disable` to undo an `ffm enable`. | More steps for bulk rollback. Acceptable for v1. |
| **New audit entry on rollback** | Rollback is itself auditable. You can see "who rolled back what." | Audit log grows faster. Acceptable. |

---

## 13. Error Handling

### Error Class Hierarchy

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) { super(message); }
}

class NotFoundError extends AppError {
  constructor(entity: string, identifier: string) {
    super(`${entity} '${identifier}' not found`, 'NOT_FOUND', 404);
  }
}

class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

class ValidationError extends AppError {
  constructor(message: string, details: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
```

### API Error Response Format

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Customer 'acme-corp' not found",
    "details": {}
  }
}
```

### Global Error Handler (Express Middleware)

```typescript
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    logger.warn({ err, requestId: req.id }, 'Application error');
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  logger.error({ err, requestId: req.id }, 'Unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
```

### CLI Error Handling

```typescript
// CLI catches errors and formats for terminal output
try {
  const result = await apiClient.enableFeature(feature, customer, reason);
  console.log(`✓ Feature '${feature}' enabled for customer '${customer}'`);
} catch (err) {
  if (err instanceof ApiError) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  console.error(`✗ Unexpected error: ${err.message}`);
  process.exit(2);
}
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Typed error hierarchy** | API returns specific error codes. CLI can map codes to user-friendly messages. | More classes to define. Worth it for clarity. |
| **Single global error handler** | Centralized error formatting. No route-level try/catch needed. | Must be careful with async errors. Express 5 handles this natively. |
| **`requestId` on every log** | Correlate logs across the request lifecycle. Essential for debugging. | Adds a field to every log entry. Trivial. |

---

## 14. Configuration Management

### Environment Variables (Zod-validated)

```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  API_KEY_SALT_ROUNDS: z.coerce.number().int().default(12),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
```

### `.env.example`

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://ffm:password@localhost:5432/feature_flags
JWT_SECRET=change-me-to-at-least-32-characters
JWT_EXPIRES_IN=24h
API_KEY_SALT_ROUNDS=12
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Zod-validated env** | Fail fast on startup if config is missing/wrong. Type-safe `env` object. | Slightly more code than `process.env.DATABASE_URL`. Essential for reliability. |
| **No `.env` files in code** | `.env` is gitignored. `.env.example` is committed as documentation. | Developers must copy `.env.example` → `.env`. Standard practice. |
| **No config service/dotenv library** | Zod validates at startup. No need for `dotenv` if using `--env-file` or system env. | Requires explicit env setup. Deterministic. |

---

## 15. Logging Strategy

### Library: Pino

```typescript
// src/lib/logger.ts
import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: { service: 'feature-flag-manager' },
});

// Request-scoped logger
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}
```

### Log Levels

| Level | When | Example |
|---|---|---|
| `debug` | Development only | SQL queries, request/response bodies |
| `info` | Normal operations | Feature enabled, user logged in, migration applied |
| `warn` | Recoverable issues | Rate limit approaching, deprecated API usage |
| `error` | Failures requiring attention | DB connection failed, unhandled exception |

### Structured Logging Format

```json
{
  "level": "info",
  "time": "2026-07-28T10:30:00.000Z",
  "service": "feature-flag-manager",
  "requestId": "req_clx9abc",
  "message": "Feature enabled",
  "featureKey": "advanced-analytics",
  "customerName": "Customer A",
  "enabledBy": "kai@example.com"
}
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Pino (not Winston)** | 5-10x faster than Winston. JSON output by default. Low overhead. | Less plugin ecosystem than Winston. Fine for our needs. |
| **Structured JSON** | Machine-parseable. Integrates with log aggregation (Datadog, CloudWatch, etc.). | Not human-readable in production. `pino-pretty` for dev. |
| **Request-scoped child loggers** | Every log entry includes `requestId`. Correlate across the request. | Extra parameter threading. Essential for debugging. |

---

## 16. Testing Strategy

### Test Pyramid

```
         ╱╲
        ╱  ╲        E2E / Smoke Tests (5%)
       ╱    ╲       CLI integration tests
      ╱──────╲
     ╱        ╲     Integration Tests (25%)
    ╱          ╲    API endpoint tests with real DB
   ╱────────────╲
  ╱              ╲  Unit Tests (70%)
 ╱                ╲ Service logic, repository mapping, validation
╱──────────────────╲
```

### Test Organization

```
tests/
├── unit/
│   ├── services/
│   │   ├── assignment.service.test.ts
│   │   ├── feature.service.test.ts
│   │   └── customer.service.test.ts
│   ├── repositories/
│   │   └── assignment.repository.test.ts  (mocked Prisma)
│   └── lib/
│       └── errors.test.ts
├── integration/
│   ├── api/
│   │   ├── customers.test.ts
│   │   ├── features.test.ts
│   │   └── assignments.test.ts
│   └── repositories/
│       └── assignment.repository.test.ts  (real DB)
└── fixtures/
    ├── seed.ts
    └── factories.ts
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
```

### Test Data Strategy

- **Unit tests:** Mock repositories with in-memory data. Test service logic in isolation.
- **Integration tests:** Use a dedicated test database. Run migrations before tests, seed test data, clean up after.
- **Factories:** `createTestCustomer()`, `createTestFeature()`, `createTestUser()` helpers for consistent test data.

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Vitest (not Jest)** | Native ESM support. Faster watch mode. Compatible with Vite ecosystem. | Smaller community than Jest. Growing fast. |
| **70% unit, 25% integration, 5% E2E** | Unit tests for fast feedback. Integration tests catch Prisma/DB issues. E2E for smoke testing. | Integration tests need a DB. CI needs PostgreSQL service container. |
| **Test database per environment** | Never test against production. Isolated test DB per developer/CI. | DB management overhead. Automated with `prisma migrate reset`. |

---

## 17. Deployment Architecture

### Development

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Developer   │────▶│  Docker      │────▶│  PostgreSQL  │
│  Machine     │     │  Compose     │     │  (container) │
└─────────────┘     └──────────────┘     └──────────────┘
```

### Production

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Load        │────▶│  App Server  │────▶│  PostgreSQL  │
│  Balancer    │     │  (Node.js)   │     │  (RDS/managed│
│  (nginx)     │     │  Replicas    │     │   or ECS)    │
└──────────────┘     └──────────────┘     └──────────────┘
       │                                        │
       ▼                                        ▼
┌──────────────┐                       ┌──────────────┐
│  Health      │                       │  Automated   │
│  Checks      │                       │  Backups     │
└──────────────┘                       └──────────────┘
```

### CI/CD Pipeline

```
Push to main
    │
    ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  Lint +  │──▶│  Unit    │──▶│Integration│──▶│  Build + │
│  Typecheck│   │  Tests   │   │  Tests   │   │  Deploy  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Docker for dev, managed DB for prod** | Docker Compose for local parity. Managed PostgreSQL (RDS) for production reliability. | Cost of managed DB. Worth it for automated backups, patching, HA. |
| **Stateless app servers** | No session state in-memory. JWT is stateless. Horizontal scaling is trivial. | All state in PostgreSQL. DB becomes the bottleneck (not at this scale). |
| **Single container deployment** | App + Prisma in one container. Simple. | Can't scale CLI independently (irrelevant — CLI is a client). |

---

## 18. Docker Architecture

### `docker-compose.yml` (Development)

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ffm
      POSTGRES_PASSWORD: password
      POSTGRES_DB: feature_flags
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgresql://ffm:password@db:5432/feature_flags
      JWT_SECRET: development-secret-minimum-32-characters
      NODE_ENV: development
    depends_on:
      - db
    volumes:
      - ./src:/app/src
    command: pnpm dev

volumes:
  pgdata:
```

### `docker/Dockerfile` (Production)

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM base AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
RUN pnpm prisma migrate deploy

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Multi-stage Docker build** | Smaller production image (~150MB vs ~800MB). No dev dependencies in prod. | Build time slightly longer. Acceptable. |
| **Alpine base images** | Smaller images, fewer attack surface. | Some npm packages have native deps that need extra packages. Handle in Dockerfile. |
| **`pnpm --frozen-lockfile`** | Deterministic installs. Same `node_modules` in dev and prod. | Must commit `pnpm-lock.yaml`. Standard practice. |

---

## 19. Security Considerations

| Concern | Mitigation |
|---|---|
| **SQL Injection** | Prisma parameterizes all queries. No raw SQL for user input. |
| **Authentication bypass** | All endpoints require JWT or API key (except `/health` and `/api/auth/login`). |
| **Role escalation** | RBAC middleware on every route. Services also check roles as defense-in-depth. |
| **Secrets in code** | `.env` gitignored. JWT secret loaded from environment. No hardcoded secrets. |
| **Audit log tampering** | Audit table has no `UPDATE` or `DELETE` permissions for the app user. |
| **Brute force on login** | Rate limiting on `/api/auth/login`: 5 attempts per minute per IP. |
| **Rate limiting on mutations** | Assignment mutation endpoints (`PUT`/`DELETE` on `/api/customers/:id/features/:featureId`): 60 requests/minute per authenticated user (keyed on `userId`, not IP). Prevents accidental or malicious bulk toggling. |
| **API key leakage** | API keys shown once at creation time. Stored as bcrypt hash in DB. Revocable per-key. Keys checked for expiry and revocation on every request. |
| **Dependency vulnerabilities** | `pnpm audit` in CI. Dependabot/Renovate for automated updates. |
| **Container security** | Non-root user in Docker. Read-only filesystem where possible. |

### Database User Permissions

```sql
-- Application user: limited permissions
CREATE USER ffm_app WITH PASSWORD '...';
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ffm_app;
-- No DELETE on audit_logs table
-- DELETE only on customers, features, assignments

-- Migration user: full permissions
CREATE USER ffm_migrate WITH PASSWORD '...';
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ffm_migrate;
```

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Defense-in-depth RBAC** | Middleware + service layer both check permissions. If one is bypassed, the other catches it. | Two places to maintain roles. Security is worth it. |
| **Rate limiting on login** | Prevents credential stuffing. | Legitimate users may get locked out. 5/minute is generous. |
| **Rate limiting on mutations** | Prevents runaway scripts or accidental bulk toggle operations. Per-user (not per-IP) so shared NAT IPs don't collide. | `express-rate-limit` uses in-memory store by default — must switch to Redis adapter if running multiple API replicas. |
| **No DELETE on audit_logs** | Audit logs are immutable. Even admins can't delete them. | No way to purge old audit logs. Acceptable — use partitioning for archival. |

---

## 20. Scalability Considerations

| Dimension | Current Capacity | Scaling Path |
|---|---|---|
| **Customers** | ~10K | Indexed `name` and `id` columns. No issue at 100K+. |
| **Features** | ~100 | Small table. No scaling concern. |
| **Assignments** | ~1M (10K × 100) | Composite unique index. Partition by `customerId` if needed. |
| **Audit logs** | ~10M/year | Partition by `createdAt` (monthly). Archive old partitions to S3. |
| **API requests** | ~100 RPS | Single Node.js instance handles this. Horizontal scaling via replicas if needed. |
| **CLI users** | ~50 concurrent | Negligible load. |

### Database Optimization

- **Connection pooling:** Prisma's built-in connection pool (`connection_limit` in `DATABASE_URL` query param). Default 10 connections.
- **Indexes:** Already defined on hot query paths (`customerId`, `featureId`, `createdAt`).
- **Read replicas:** If read load grows, add a Prisma read replica for `findMany` queries. Mutations still hit primary.

### Rationale

| Decision | Why | Trade-offs |
|---|---|---|
| **Single PostgreSQL instance** | Internal tool, modest scale. 100K customers with 100 features = 10M assignments (fits in memory). | Can't handle millions of QPS. Not needed. |
| **Partitioning for audit logs** | Audit logs grow unbounded. Monthly partitions allow cheap archival. | Adds migration complexity. Do when audit logs exceed 10M rows. |

---

## 21. Future Improvements

| Improvement | Priority | Effort | Rationale |
|---|---|---|---|
| **Web UI (React)** | High | Medium | Support engineers prefer a visual dashboard for bulk operations. |
| **Bulk import/export** | High | Low | CSV import of feature assignments. Critical for migration from current system. |
| **Webhook notifications** | Medium | Low | Notify Slack/ PagerDuty when features are enabled/disabled for specific customers. |
| **Scheduled changes** | Medium | Medium | "Enable feature X for customer Y at 2026-08-01 00:00 UTC." Cron-based scheduler. |
| **Feature flag targeting** | Medium | High | Percentage rollouts, user segment targeting (if tool expands beyond customer-level). |
| **SSO/OIDC integration** | Medium | Medium | Replace password auth with company SSO (Okta, Google Workspace). |
| **Soft deletes** | Low | Low | Add `deletedAt` column. Prevent accidental data loss. Restore capability. |
| **Audit log archival** | Low | Low | Move old audit logs to S3 + Athena for long-term retention and compliance queries. |
| **Multi-environment support** | Low | Medium | Separate `staging` / `production` databases. CLI `--env staging` flag. |
| **Policy-as-code** | Low | High | Define feature flag policies in YAML (e.g., "never enable feature X for customers in regulated industries"). |

---

## 22. Technology Decision Summary

| Component | Choice | Why Not Alternatives |
|---|---|---|
| **Language** | TypeScript | Single language for CLI + API + tests. Team expertise. |
| **Runtime** | Node.js | LTS support. Fast startup. Docker-friendly. |
| **Database** | PostgreSQL | ACID. JSON support for audit. Rich query capabilities. Battle-tested. |
| **ORM** | Prisma | Type-safe. Excellent migration system. Schema-as-code. |
| **CLI framework** | Commander.js | Mature, minimal, well-documented. |
| **Validation** | Zod | TypeScript-first. Composable schemas. Used for API and env validation. |
| **Testing** | Vitest | Fast. ESM-native. Jest-compatible API. |
| **Logging** | Pino | Fastest Node.js logger. Structured JSON output. |
| **Package manager** | pnpm | Fast, strict, disk-efficient. Monorepo-ready. |

---

## Appendix A: API Request Lifecycle

```
1. Client sends request
2. Express receives request
3. Request ID middleware assigns requestId
4. Request logger logs incoming request
5. Auth middleware extracts JWT/API key → attaches user to req
6. RBAC middleware checks role against route permissions
7. Validation middleware validates request body/params with Zod
8. Route handler calls service method
9. Service validates business rules
10. Service calls repository methods within $transaction
11. Repository executes Prisma queries, maps to domain types
12. Service writes audit log entry within same transaction
13. Service returns domain result to route handler
14. Route handler formats response (200/201/204)
15. Request logger logs outgoing response
16. Error handler catches any thrown errors → formats error response
```

## Appendix B: CLI Request Lifecycle

```
1. User runs `ffm enable advanced-analytics "Customer A" --reason "Q3 rollout"`
2. Commander parses command, args, and options
3. CLI reads JWT from ~/.config/ffm/token
4. CLI sends PUT /api/customers/{id}/features/{featureId} with Authorization header
5. API processes request (steps 1-13 above)
6. If API responds 401: prints "Session expired. Run `ffm login` to re-authenticate." and exits 1
7. CLI receives JSON response
8. CLI formats output as table/json/csv based on --format flag
9. CLI prints result to stdout
10. CLI exits with code 0 (success) or 1 (error)
```

## Appendix C: Database Migration Strategy

1. **Schema changes** are made in `prisma/schema.prisma`.
2. **Migrations** are generated via `pnpm prisma migrate dev --name <description>`.
3. **Migration files** are committed to version control.
4. **Production deployments** run `pnpm prisma migrate deploy` at startup.
5. **Drift detection:** CI runs `pnpm prisma migrate diff --exit-code` to ensure migration files match the actual schema.
6. **Backward compatibility:** Schema changes must be backward-compatible with the current running code version (expand-then-contract pattern).
