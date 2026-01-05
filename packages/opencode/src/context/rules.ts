import z from "zod"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Ripgrep } from "../file/ripgrep"
import path from "path"
import fs from "fs/promises"

export namespace ReviewRules {
  const log = Log.create({ service: "review-rules" })

  /**
   * Schema for a single review rule
   */
  export const Rule = z.object({
    name: z.string().describe("Unique identifier for the rule"),
    description: z.string().optional().describe("Human-readable description of what this rule checks"),
    trigger: z.object({
      patterns: z.array(z.string()).describe("Glob patterns that trigger this rule when matched"),
    }),
    context: z.object({
      include: z.array(z.string()).describe("Glob patterns of files to fetch as context"),
      maxFiles: z.number().optional().default(10).describe("Maximum number of files to include"),
      maxLinesPerFile: z.number().optional().default(500).describe("Maximum lines to include per file"),
    }),
    prompt: z.string().optional().describe("Additional prompt instructions when this rule is triggered"),
  })
  export type Rule = z.infer<typeof Rule>

  /**
   * Schema for the review rules configuration
   */
  export const Config = z.object({
    rules: z.array(Rule),
  })
  export type Config = z.infer<typeof Config>

  /**
   * Default review rules shipped with opencode
   * Based on layered Node.js/Express and Ruby/Rails patterns
   */
  export const DEFAULT_RULES: Rule[] = [
    // ====== ALWAYS ACTIVE ======
    {
      name: "conventions-memory-bank",
      description: "Inject project-specific coding conventions and institutional knowledge",
      trigger: {
        patterns: ["**/*"],
      },
      context: {
        include: [
          "**/MEMORY_BANK.md",
          "**/memory-bank.md",
          "**/CONVENTIONS.md",
          "**/conventions.md",
          "**/.opencode/conventions.md",
          "**/.github/MEMORY_BANK.md",
          "**/.github/memory-bank.md",
          "**/.github/runner-scripts/memory-bank.md",
          "**/AGENTS.md",
          "**/CLAUDE.md",
          "**/OPENCODE.md",
          "**/RAKAMIND.md",
        ],
        maxFiles: 3,
        maxLinesPerFile: 2000,
      },
      prompt: `Use the conventions/memory-bank as ground truth for project-specific standards.`,
    },

    // ====== MODEL ↔ MIGRATION ======
    {
      name: "model-migration-sync",
      description: "Verify model changes have corresponding migrations and vice versa",
      trigger: {
        patterns: [
          // Node.js
          "**/models/*.js",
          "**/models/**/*.js",
          "**/src/migrations/*.js",
          // Ruby
          "**/app/models/*.rb",
          "**/db/migrate/*.rb",
          // Prisma/TypeORM
          "**/schema.prisma",
          "**/entities/**/*.ts",
        ],
      },
      context: {
        include: [
          "**/models/*.js",
          "**/models/**/*.js",
          "**/src/migrations/*.js",
          "**/app/models/*.rb",
          "**/db/migrate/*.rb",
          "**/schema.prisma",
        ],
        maxFiles: 15,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing models or migrations, CHECK THE REVIEW CONTEXT for branch strictness:
- Verify new model fields have corresponding migration columns
- Check column types match between model definition and migration
- Verify foreign key constraints and indexes
- Check paranoid/soft-delete is consistent (deletedAt column)
- For Sequelize: verify associations (belongsTo, hasMany, etc.) match FKs

IMPORTANT: The ENFORCEMENT LEVEL depends on target branch:
- If targeting PROTECTED branch (main, production): Missing items are BLOCKERS
- If targeting NON-PROTECTED branch: Missing items are INFO/reminders only
- Follow the "CONCURRENT IMPLEMENTATION RULES" in the review context for strictness`,
    },

    // ====== CONTROLLER ↔ INPUT ↔ OUTPUT ======
    {
      name: "controller-input-output",
      description: "Verify controllers use proper Input validation and Output formatting",
      trigger: {
        patterns: [
          // Node.js/Express
          "**/controllers/*.js",
          "**/controllers/**/*.js",
          "**/inputs/*.js",
          "**/inputs/**/*.js",
          "**/outputs/*.js",
          "**/outputs/**/*.js",
          // Ruby/Rails
          "**/app/controllers/**/*.rb",
          "**/app/inputs/**/*.rb",
        ],
      },
      context: {
        include: [
          "**/controllers/*.js",
          "**/inputs/*.js",
          "**/outputs/*.js",
          "**/app/controllers/**/*.rb",
          "**/app/inputs/**/*.rb",
        ],
        maxFiles: 12,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing controllers, inputs, or outputs:
- Controllers should be thin: validate input → call service → format output
- Input classes must validate with JSON schema or strong params
- Output classes must format response consistently (renderJson, renderJsonArray)
- Check that input.validate() is called before using data
- Verify output fields match API contract`,
    },

    // ====== SERVICE ↔ REPOSITORY ======
    {
      name: "service-repository",
      description: "Verify service/repository layer separation",
      trigger: {
        patterns: [
          "**/services/*.js",
          "**/services/**/*.js",
          "**/repositories/*.js",
          "**/app/services/**/*.rb",
          "**/app/lib/repositories/**/*.rb",
        ],
      },
      context: {
        include: [
          "**/services/*.js",
          "**/services/**/*.js",
          "**/repositories/*.js",
          "**/app/services/**/*.rb",
        ],
        maxFiles: 10,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing services or repositories:
- Services contain business logic, validations, and orchestration
- Repositories handle data access (queries, pagination, filtering)
- Services should NOT contain raw SQL or complex queries
- Repositories should NOT contain business logic
- Check for proper error handling and transactions
- Services should extend AppService/ApplicationService`,
    },

    // ====== JOBS ======
    {
      name: "background-jobs",
      description: "Review background jobs for proper error handling and idempotency",
      trigger: {
        patterns: [
          "**/jobs/*.js",
          "**/jobs/**/*.js",
          "**/app/jobs/*.rb",
          "**/workers/**/*.rb",
        ],
      },
      context: {
        include: [
          "**/jobs/*.js",
          "**/jobs/index.js",
          "**/ApplicationJob.js",
          "**/app/jobs/application_job.rb",
        ],
        maxFiles: 8,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing background jobs:
- Jobs must extend ApplicationJob
- Verify idempotency (safe to run multiple times)
- Check error handling and retry configuration
- Verify job is registered in index.js or job registry
- Check for proper queue selection (default, critical, low_priority)`,
    },

    // ====== MAILERS ======
    {
      name: "mailers",
      description: "Review email mailers for proper configuration",
      trigger: {
        patterns: [
          "**/mailers/*.js",
          "**/app/mailers/*.rb",
        ],
      },
      context: {
        include: [
          "**/mailers/*.js",
          "**/mailers/ApplicationMailer.js",
          "**/app/mailers/application_mailer.rb",
        ],
        maxFiles: 6,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing mailers:
- Must extend ApplicationMailer
- Check template rendering and variable passing
- Verify subject lines are localized if applicable
- Check for proper error handling
- Verify mailer uses job queue for async sending`,
    },

    // ====== ROUTES ======
    {
      name: "routes",
      description: "Review route definitions for consistency",
      trigger: {
        patterns: [
          "**/routes/*.js",
          "**/routes/**/*.js",
          "**/config/routes.rb",
        ],
      },
      context: {
        include: [
          "**/routes/*.js",
          "**/app.js",
          "**/config/routes.rb",
          "**/middlewares/auth.js",
        ],
        maxFiles: 10,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing routes:
- Verify authentication middleware is applied correctly
- Check rate limiter configuration
- RESTful conventions: index, show, create, update, destroy
- Verify route naming matches controller methods
- Check permissions/authorization middleware`,
    },

    // ====== TESTS ======
    {
      name: "test-coverage",
      description: "Verify test coverage for changed code",
      trigger: {
        patterns: [
          "**/src/**/*.js",
          "**/app/**/*.rb",
          "**/lib/**/*.rb",
        ],
      },
      context: {
        include: [
          // Node.js/Jest
          "**/tests/**/*.test.js",
          "**/tests/**/*.spec.js",
          "**/tests/factories/*.js",
          // Ruby/RSpec
          "**/spec/**/*_spec.rb",
          "**/spec/factories/*.rb",
        ],
        maxFiles: 10,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing source code, check for corresponding tests:
- Controllers should have integration tests
- Services should have unit tests
- Jobs should have tests verifying correct behavior
- Critical business logic MUST have test coverage
- Check that tests use factories, not raw data`,
    },

    // ====== DOCUMENTATION ======
    {
      name: "documentation",
      description: "Include relevant documentation for context",
      trigger: {
        patterns: [
          "**/controllers/**/*.js",
          "**/services/**/*.js",
          "**/models/**/*.js",
          "**/jobs/**/*.js",
        ],
      },
      context: {
        include: [
          "**/docs/*.md",
          "**/docs/controllers.md",
          "**/docs/services.md",
          "**/docs/models.md",
          "**/docs/repositories.md",
          "**/docs/job-system.md",
        ],
        maxFiles: 5,
        maxLinesPerFile: 500,
      },
      prompt: `Use the documentation to understand project conventions and patterns.`,
    },

    // ====== MIDDLEWARE ======
    {
      name: "middleware",
      description: "Review middleware for security and performance",
      trigger: {
        patterns: [
          "**/middlewares/*.js",
          "**/app/middlewares/**/*.rb",
        ],
      },
      context: {
        include: [
          "**/middlewares/*.js",
          "**/app/middlewares/**/*.rb",
        ],
        maxFiles: 8,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing middleware:
- Check for proper error handling (next(e) pattern)
- Verify authentication middleware returns proper errors
- Check rate limiting configuration
- Verify middleware order is correct`,
    },

    // ====== ERRORS ======
    {
      name: "error-handling",
      description: "Review error classes and handling",
      trigger: {
        patterns: [
          "**/errors/*.js",
          "**/app/errors/*.rb",
        ],
      },
      context: {
        include: [
          "**/errors/*.js",
          "**/middlewares/errorHandler.js",
        ],
        maxFiles: 6,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing error handling:
- Custom errors should extend base error class
- Verify HTTP status codes are appropriate
- Check error messages are user-friendly
- Sensitive info should not leak in error responses`,
    },

    // ====== CACHES ======
    {
      name: "caching",
      description: "Review cache implementations",
      trigger: {
        patterns: [
          "**/caches/*.js",
          "**/app/caches/*.rb",
        ],
      },
      context: {
        include: [
          "**/caches/*.js",
          "**/config/cache.js",
          "**/config/redis.js",
          "**/app/caches/*.rb",
        ],
        maxFiles: 6,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing cache code:
- Check cache key generation for uniqueness
- Verify TTL is appropriate
- Check cache invalidation strategy
- Verify Redis connection handling`,
    },

    // ====== TEST → BUSINESS LOGIC ======
    {
      name: "test-business-logic",
      description: "When reviewing tests, fetch source code to verify business logic coverage",
      trigger: {
        patterns: [
          // Node.js/Jest
          "**/tests/**/*.test.js",
          "**/tests/**/*.spec.js",
          "**/*.test.js",
          "**/*.spec.js",
          // Ruby/RSpec
          "**/spec/**/*_spec.rb",
        ],
      },
      context: {
        include: [
          // Node.js source
          "**/controllers/*.js",
          "**/services/*.js",
          "**/services/**/*.js",
          "**/repositories/*.js",
          "**/jobs/*.js",
          "**/mailers/*.js",
          // Ruby source
          "**/app/controllers/**/*.rb",
          "**/app/services/**/*.rb",
          "**/app/models/*.rb",
        ],
        maxFiles: 10,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing tests, verify they properly cover business logic:
- Check edge cases are tested (null, empty, boundary values)
- Verify error scenarios are covered
- Check happy path AND failure paths
- Verify mocks are appropriate (not over-mocking)
- Check assertions are meaningful (not just "it doesn't throw")
- For controllers: test request validation, auth, and response format
- For services: test business rules and side effects
- For jobs: test idempotency and failure handling`,
    },

    // ====== DATABASE TRANSACTIONS ======
    {
      name: "database-transactions",
      description: "Verify multi-step database operations use transactions",
      trigger: {
        patterns: [
          "**/services/*.js",
          "**/services/**/*.js",
          "**/jobs/*.js",
          "**/app/services/**/*.rb",
        ],
      },
      context: {
        include: [
          "**/config/sequelize.js",
          "**/models/index.js",
        ],
        maxFiles: 4,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing services or jobs with multiple database operations:
- Multi-step writes MUST be wrapped in transaction
- Verify transaction.commit() on success
- Verify transaction.rollback() in catch block
- Check for advisory locks on concurrent operations (transactionWithAdvLock)
- Jobs that queue other jobs should use transaction.afterCommit()
- For Rails: use ActiveRecord::Base.transaction`,
    },

    // ====== N+1 QUERY PREVENTION ======
    {
      name: "n-plus-one-queries",
      description: "Detect potential N+1 query patterns",
      trigger: {
        patterns: [
          "**/repositories/*.js",
          "**/services/*.js",
          "**/controllers/*.js",
          "**/app/models/*.rb",
        ],
      },
      context: {
        include: [
          "**/models/*.js",
          "**/models/index.js",
          "**/repositories/BaseRepository.js",
        ],
        maxFiles: 8,
        maxLinesPerFile: 300,
      },
      prompt: `Watch for N+1 query patterns:
- Loops that call findByPk/findOne inside → use include/eager loading
- Check 'include:' arrays for nested associations
- Verify buildIncludeClause is used for dynamic includes
- For bulk operations: batch loading, not individual queries
- For Rails: use .includes(), .preload(), .eager_load()`,
    },

    // ====== SECURITY PATTERNS ======
    {
      name: "security-patterns",
      description: "Review security-sensitive code",
      trigger: {
        patterns: [
          "**/auth/**/*.js",
          "**/middlewares/auth.js",
          "**/inputs/*.js",
          "**/repositories/*.js",
          "**/app/auth/**/*.rb",
        ],
      },
      context: {
        include: [
          "**/tests/**/*.security.test.js",
          "**/middlewares/auth.js",
          "**/errors/*.js",
        ],
        maxFiles: 8,
        maxLinesPerFile: 300,
      },
      prompt: `Security review checklist:
- SQL injection: use parameterized queries, Sequelize.escape()
- Input validation: sanitize user input, validate ltree paths
- Auth: verify JWT validation, check permission middleware
- Sensitive data: don't log passwords/tokens/API keys
- Response: don't expose internal errors to users
- Hierarchy queries: validate path format before use
- BOLA/IDOR: verify user owns the resource before update/delete`,
    },

    // ====== EXTERNAL API INTEGRATIONS ======
    {
      name: "external-api-integration",
      description: "Review external API/service integrations",
      trigger: {
        patterns: [
          "**/services/external/*.js",
          "**/services/*Service.js",
          "**/lib/*Service.js",
          "**/app/services/external/**/*.rb",
        ],
      },
      context: {
        include: [
          "**/services/external/*.js",
          "**/tests/mocks/*.js",
          "**/config/*.js",
        ],
        maxFiles: 8,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing external API integrations:
- Verify timeout configuration
- Check retry logic with exponential backoff
- Handle API errors gracefully (don't crash on 5xx)
- Validate response data before using
- Check for rate limiting awareness
- Verify API keys come from env, not hardcoded
- Mock exists for testing (tests/mocks/)`,
    },

    // ====== DATABASE INDEXES ======
    {
      name: "database-indexes",
      description: "Verify migrations add appropriate indexes",
      trigger: {
        patterns: [
          "**/migrations/*.js",
          "**/db/migrate/*.rb",
        ],
      },
      context: {
        include: [
          "**/models/*.js",
          "**/repositories/*.js",
        ],
        maxFiles: 10,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing migrations, THINK about how data will be queried:

INDEX DECISION FRAMEWORK:
1. What queries will this table serve? (list the common access patterns)
2. What columns appear in WHERE clauses? (need indexes)
3. What columns appear in ORDER BY? (consider in compound index)
4. Are there JOINs through this table? (foreign keys need indexes)

QUERY PATTERN ANALYSIS:
- "Get X by Y" → Index on Y
- "Get X by Y ordered by Z" → Compound index (Y, Z)
- "Get children of parent ordered by date" → Index on (parent_fk, created_at)
- "Get recent items" → Index on (created_at) or include in compound

SELF-REFERENTIAL / HIERARCHICAL TABLES:
- If a table references itself (parent_id pattern), think about:
  - How will children be fetched? By parent + sort order?
  - Recommend appropriate compound index based on query pattern

Always explain WHY an index is needed based on expected query patterns.`,
    },

    // ====== FACTORY & TEST DATA CONSISTENCY ======
    {
      name: "factory-consistency",
      description: "Verify test factories match model definitions",
      trigger: {
        patterns: [
          "**/tests/factories/*.js",
          "**/spec/factories/*.rb",
        ],
      },
      context: {
        include: [
          "**/models/*.js",
          "**/app/models/*.rb",
          "**/tests/factories/BaseFactory.js",
        ],
        maxFiles: 10,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing factories:
- Factory fields must match model definition
- Required fields should have default values
- Associations must use correct factory
- Traits/variations for different states
- Use faker for realistic test data
- Check for circular dependencies in associations`,
    },

    // ====== AUDIT LOGGING ======
    {
      name: "audit-logging",
      description: "Verify audit logging for sensitive operations",
      trigger: {
        patterns: [
          "**/services/*.js",
          "**/jobs/*.js",
          "**/controllers/*.js",
          "**/app/services/**/*.rb",
        ],
      },
      context: {
        include: [
          "**/jobs/AuditLogJob.js",
          "**/middlewares/auditLog.js",
          "**/repositories/AuditLogsRepository.js",
        ],
        maxFiles: 5,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing code with sensitive operations:
- Create/update/delete operations should trigger audit logs
- Use AuditLogJob.performLater() for async logging
- Include actor, action, resource, and changes in audit
- Check namespace.get('auditLogContext') propagation
- Jobs should pass parent_transaction_id for tracing`,
    },

    // ====== FILE UPLOAD SECURITY ======
    {
      name: "file-upload-security",
      description: "Review file upload and S3 operations",
      trigger: {
        patterns: [
          "**/services/UploadService.js",
          "**/controllers/UploadsController.js",
          "**/lib/FileStorageBucket.js",
          "**/lib/StoredFile.js",
        ],
      },
      context: {
        include: [
          "**/services/UploadService.js",
          "**/lib/FileStorageBucket.js",
          "**/inputs/*Upload*.js",
        ],
        maxFiles: 6,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing file upload code:
- Validate file type/extension before upload
- Sanitize filenames (remove special chars, spaces)
- Use presigned URLs with expiration
- Verify content-type matches extension
- Check max file size limits
- S3 bucket should not be public
- Use secure upload paths (user-specific prefixes)`,
    },

    // ====== CI/CD WORKFLOWS ======
    {
      name: "ci-cd-workflows",
      description: "Review CI/CD pipeline configurations",
      trigger: {
        patterns: [
          "**/.github/workflows/*.yml",
          "**/.github/workflows/*.yaml",
          "**/.circleci/config.yml",
        ],
      },
      context: {
        include: [
          "**/.github/workflows/*.yml",
          "**/package.json",
          "**/Dockerfile",
        ],
        maxFiles: 6,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing CI/CD workflows:
- Secrets should use GitHub secrets, not hardcoded
- Check for proper caching (node_modules, bun cache)
- Verify test step runs before deploy
- Check Docker build context and layer caching
- Verify proper environment variable injection
- Check trigger conditions (branches, paths)`,
    },

    // ====== SOFT DELETE / PARANOID ======
    {
      name: "soft-delete-paranoid",
      description: "Verify soft delete consistency",
      trigger: {
        patterns: [
          "**/models/*.js",
          "**/repositories/*.js",
          "**/migrations/*.js",
          "**/app/models/*.rb",
        ],
      },
      context: {
        include: [
          "**/models/*.js",
          "**/migrations/*.js",
        ],
        maxFiles: 10,
        maxLinesPerFile: 200,
      },
      prompt: `When reviewing models with soft delete (CHECK REVIEW CONTEXT for enforcement level):
- Model should have paranoid: true if soft delete is used
- Migration should include deleted_at column
- Queries should respect soft delete (default behavior)
- Force: true only when GDPR hard delete is needed
- Check cascading deletes for associations
- Restore functionality if needed

Note: Enforcement level depends on target branch per "CONCURRENT IMPLEMENTATION RULES" in review context`,
    },

    // ====== PERMISSION / AUTHORIZATION ======
    {
      name: "permission-authorization",
      description: "Review permission and authorization logic",
      trigger: {
        patterns: [
          "**/middlewares/auth.js",
          "**/controllers/*.js",
          "**/services/PermissionService.js",
          "**/caches/RolePermissionCache.js",
        ],
      },
      context: {
        include: [
          "**/middlewares/auth.js",
          "**/services/PermissionService.js",
          "**/caches/RolePermissionCache.js",
          "**/models/Permission.js",
          "**/models/RolePermission.js",
        ],
        maxFiles: 8,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing authorization code:
- All endpoints should have permission checks
- Use role-based access control (RBAC)
- Cache permissions for performance
- Check resource ownership (BOLA prevention)
- Verify permission names match feature names
- Super admin bypass should be intentional`,
    },

    // ====== AI/LLM INTEGRATION ======
    {
      name: "ai-llm-integration",
      description: "Review AI/LLM service integrations",
      trigger: {
        patterns: [
          "**/services/external/GoogleAiService.js",
          "**/services/*Ai*.js",
          "**/services/*Llm*.js",
          "**/jobs/*Llm*.js",
          "**/jobs/Process*Job.js",
        ],
      },
      context: {
        include: [
          "**/services/external/GoogleAiService.js",
          "**/jobs/LogLlmInteractionJob.js",
          "**/models/LlmMetadata.js",
          "**/tests/mocks/*Ai*.js",
        ],
        maxFiles: 8,
        maxLinesPerFile: 400,
      },
      prompt: `When reviewing AI/LLM integrations:
- Log all LLM interactions (input, output, tokens, cost)
- Handle rate limits and quota errors
- Implement retry with exponential backoff
- Validate and sanitize LLM outputs before using
- Check for prompt injection vulnerabilities
- Use structured output (JSON mode) when possible
- Test with mocks, not real API calls`,
    },

    // ====== LOGGING / OBSERVABILITY ======
    {
      name: "logging-observability",
      description: "Review logging and observability patterns",
      trigger: {
        patterns: [
          "**/config/logger.js",
          "**/middlewares/logging.js",
          "**/middlewares/prometheus.js",
          "**/services/*.js",
        ],
      },
      context: {
        include: [
          "**/config/logger.js",
          "**/middlewares/logging.js",
          "**/middlewares/prometheus.js",
        ],
        maxFiles: 6,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing logging code:
- Use structured logging (JSON format)
- Include correlation IDs for tracing
- Don't log sensitive data (passwords, tokens, PII)
- Use appropriate log levels (debug, info, warn, error)
- Add metrics for critical operations (Prometheus)
- Check for log injection vulnerabilities`,
    },

    // ====== MODEL HOOKS / LIFECYCLE ======
    {
      name: "model-hooks-lifecycle",
      description: "Review model hooks and lifecycle callbacks",
      trigger: {
        patterns: [
          "**/models/*.js",
          "**/app/models/*.rb",
        ],
      },
      context: {
        include: [
          "**/models/AppModel.js",
          "**/models/*.js",
        ],
        maxFiles: 8,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing model hooks (beforeCreate, afterUpdate, etc.):
- Hooks should be fast (no heavy operations)
- Avoid circular triggers (update triggers update)
- Use hooks for data normalization (lowercase email, trim)
- Hash passwords in beforeCreate/beforeUpdate
- Don't put business logic in hooks (use services)
- Check options.transaction is passed through
- For Rails: use before_validation, before_save, after_commit`,
    },

    // ====== RATE LIMITING ======
    {
      name: "rate-limiting",
      description: "Review rate limiting configuration",
      trigger: {
        patterns: [
          "**/middlewares/rateLimiter.js",
          "**/routes/*.js",
          "**/app.js",
        ],
      },
      context: {
        include: [
          "**/middlewares/rateLimiter.js",
          "**/config/cache.js",
          "**/routes/*.js",
        ],
        maxFiles: 8,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing rate limiting:
- Auth endpoints need stricter limits (5 per 15 min)
- Public endpoints need looser limits
- Use Redis for distributed rate limiting
- Check skip paths configuration
- Different limits per endpoint sensitivity
- Return proper 429 status with Retry-After header`,
    },

    // ====== CONFIG / ENVIRONMENT ======
    {
      name: "config-environment",
      description: "Review configuration and environment handling",
      trigger: {
        patterns: [
          "**/config/*.js",
          "**/config/*.rb",
          "**/.env.example",
        ],
      },
      context: {
        include: [
          "**/config/config.js",
          "**/config/sequelize.js",
          "**/config/redis.js",
          "**/.env.example",
        ],
        maxFiles: 6,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing configuration:
- Sensitive values must come from env vars
- Provide sensible defaults for non-sensitive values
- Validate required env vars on startup
- Use different configs for dev/test/prod
- Document all env vars in .env.example
- Check for hardcoded secrets or API keys`,
    },

    // ====== API RESPONSE FORMAT ======
    {
      name: "api-response-format",
      description: "Ensure consistent API response formatting",
      trigger: {
        patterns: [
          "**/outputs/*.js",
          "**/controllers/*.js",
        ],
      },
      context: {
        include: [
          "**/outputs/ApiOutput.js",
          "**/outputs/*.js",
          "**/errors/*.js",
        ],
        maxFiles: 10,
        maxLinesPerFile: 300,
      },
      prompt: `When reviewing API responses:
- Consistent structure: { data, meta, errors }
- Use Output classes for all responses
- Include pagination meta for list endpoints
- Use camelCase for JSON keys
- Don't expose internal IDs if not needed
- Include proper HTTP status codes
- Error responses should have error code and message`,
    },

    // ====== CODE STYLE & CLARITY (from memory-bank) ======
    {
      name: "code-style-clarity",
      description: "Review code style, imports, and redundancy",
      trigger: {
        patterns: [
          "**/services/*.js",
          "**/controllers/*.js",
          "**/repositories/*.js",
        ],
      },
      context: {
        include: [],
        maxFiles: 0,
        maxLinesPerFile: 0,
      },
      prompt: `Code style review (from memory-bank):
- No redundant imports (consolidate from same source)
- No redundant variable declarations (const { ...copy } = data)
- No redundant conditional checks (if user exists when auth middleware guarantees it)
- Explicitly declare all dependencies (no ReferenceError)
- Use singular naming for Service/Input classes (CompanyService, not CompaniesService)
- Remove dead/deprecated code
- Document conceptually overlapping entities (JobGrade vs JobLevel)
- Document complex or non-obvious logic with comments`,
    },

    // ====== INPUT SCHEMA VALIDATION (from memory-bank) ======
    {
      name: "input-schema-validation",
      description: "Verify input schemas validate all used fields",
      trigger: {
        patterns: [
          "**/inputs/*.js",
          "**/inputs/**/*.js",
        ],
      },
      context: {
        include: [
          "**/services/*.js",
          "**/controllers/*.js",
        ],
        maxFiles: 10,
        maxLinesPerFile: 300,
      },
      prompt: `Input schema review (from memory-bank):
- Schema must validate ALL fields used by business logic
- Use 'enum' to strictly enforce allowed string values
- Schema filters params, query, body - single source of truth
- Remove fields no longer used by business logic
- Use specific Input schemas per endpoint, not generic reuse
- Required fields should be in 'required' array`,
    },

    // ====== RACE CONDITION & LOCKS (from memory-bank) ======
    {
      name: "race-condition-locks",
      description: "Prevent race conditions in find-then-act patterns",
      trigger: {
        patterns: [
          "**/services/*.js",
          "**/repositories/*.js",
        ],
      },
      context: {
        include: [
          "**/models/index.js",
          "**/config/sequelize.js",
        ],
        maxFiles: 4,
        maxLinesPerFile: 200,
      },
      prompt: `Race condition prevention (from memory-bank):
- Find-then-create/update needs pessimistic lock (FOR UPDATE)
- Use lock: t.LOCK.UPDATE in Sequelize
- Or use transactionWithAdvLock for advisory locks
- Watch for TOC/TOU (Time-of-Check to Time-of-Use) bugs
- Toggle status operations need locks to prevent overwrites`,
    },

    // ====== OUTPUT FORMATTING (from memory-bank) ======
    {
      name: "output-formatting",
      description: "Verify API output formatting consistency",
      trigger: {
        patterns: [
          "**/outputs/*.js",
          "**/outputs/**/*.js",
        ],
      },
      context: {
        include: [
          "**/outputs/ApiOutput.js",
          "**/models/*.js",
        ],
        maxFiles: 8,
        maxLinesPerFile: 300,
      },
      prompt: `Output formatting review (from memory-bank):
- Map camelCase model properties to snake_case JSON keys
- Always include keys even if null (consistent shape)
- Use singular key for belongsTo, plural for hasMany
- Expose only necessary data (no toJSON() dumps)
- Format nested objects via their own Output class
- Provide defaults for missing values (|| null)`,
    },

    // ====== ASSOCIATION NAMING (from memory-bank) ======
    {
      name: "association-naming",
      description: "Verify model association naming conventions",
      trigger: {
        patterns: [
          "**/models/*.js",
          "**/app/models/*.rb",
        ],
      },
      context: {
        include: [
          "**/models/*.js",
          "**/migrations/*.js",
        ],
        maxFiles: 10,
        maxLinesPerFile: 300,
      },
      prompt: `Association naming review (from memory-bank):
- Exact case-sensitive alias in queries (workAreas not work_areas)
- Always specify foreignKey explicitly
- Use singular alias for belongsTo/hasOne
- Use plural alias for hasMany/belongsToMany
- Every foreign key column needs corresponding association
- Migration FK must match model association foreignKey`,
    },

    // ====== API LAYER SEPARATION (from memory-bank) ======
    {
      name: "api-layer-separation",
      description: "Ensure separation between data and presentation",
      trigger: {
        patterns: [
          "**/services/*.js",
          "**/controllers/*.js",
          "**/outputs/*.js",
        ],
      },
      context: {
        include: [],
        maxFiles: 0,
        maxLinesPerFile: 0,
      },
      prompt: `Layer separation review (from memory-bank):
- Service: fetch data, execute business logic
- Output: format data for API response (mapping, merging)
- Don't do presentation logic (parseInt, mapping) in services
- Controllers should be thin (delegate to services)
- Services can use multiple repositories
- Raw SQL for stats/reports should be in services, not repositories`,
    },

    // ====== DEFENSIVE CODING (from memory-bank) ======
    {
      name: "defensive-coding",
      description: "Review defensive coding patterns",
      trigger: {
        patterns: [
          "**/services/*.js",
          "**/outputs/*.js",
          "**/repositories/*.js",
        ],
      },
      context: {
        include: [],
        maxFiles: 0,
        maxLinesPerFile: 0,
      },
      prompt: `Defensive coding review (from memory-bank):
- Use optional chaining (?.) for nested property access
- Correctly attribute actions in audit trails (this.user.id for current user)
- Use declarative helpers (this.exists, this.authorize, this.assert)
- Use lazy require to break circular dependencies (code smell warning)
- Provide fallback to system config for optional values (not magic numbers)
- Let errors from external services propagate (don't swallow for monitoring)`,
    },

    // ====== RAW SQL SOFT DELETE (from memory-bank) ======
    {
      name: "raw-sql-soft-delete",
      description: "Verify raw SQL handles soft deletes correctly",
      trigger: {
        patterns: [
          "**/services/*.js",
          "**/repositories/*.js",
        ],
      },
      context: {
        include: [
          "**/models/*.js",
        ],
        maxFiles: 5,
        maxLinesPerFile: 200,
      },
      prompt: `Raw SQL soft delete review (from memory-bank):
- ORM adds deleted_at IS NULL automatically
- Raw SQL must MANUALLY add deleted_at IS NULL
- Add to both WHERE clause and JOIN conditions
- Check all tables in query that use paranoid/soft-delete
- Missing filter = data leakage, incorrect calculations`,
    },

    // ====== TEST COMPLETENESS (from memory-bank) ======
    {
      name: "test-completeness",
      description: "Verify test coverage completeness",
      trigger: {
        patterns: [
          "**/tests/**/*.test.js",
          "**/tests/**/*.spec.js",
          "**/spec/**/*_spec.rb",
        ],
      },
      context: {
        include: [
          "**/services/*.js",
          "**/controllers/*.js",
        ],
        maxFiles: 10,
        maxLinesPerFile: 300,
      },
      prompt: `Test completeness review (from memory-bank):
- Test happy paths AND failure paths
- Test edge cases (null, empty, boundary values)
- Test all enum values/branches (e.g., 'upcoming' AND 'past')
- Test authorization scenarios (own data, subordinate, peer, superior)
- Test input validation failures (missing required params)
- Test aggregate scoping (user A's stats don't include user B's data)
- Test descriptions must be accurate (not copy-pasted wrong)
- Disable rate limiting in test env`,
    },

    // ====== PR QUALITY (from memory-bank) ======
    {
      name: "pr-quality",
      description: "Review PR for production readiness",
      trigger: {
        patterns: [
          "**/*",
        ],
      },
      context: {
        include: [],
        maxFiles: 0,
        maxLinesPerFile: 0,
      },
      prompt: `PR quality review (from memory-bank):
- Remove temporary debugging code (console.log, [DEBUG] logger)
- No 'I'll fix this in the next PR' - fix now
- Migrations should be consolidated (no add-then-change-column)
- Keep feature branches up-to-date with main
- Audit and update all call sites for breaking changes
- Check for missing model associations for new FKs`,
    },
  ]

  /**
   * Load review rules from the project's .opencode directory
   */
  export async function load(): Promise<Rule[]> {
    const configPaths = [
      path.join(Instance.directory, ".opencode", "review-rules.yaml"),
      path.join(Instance.directory, ".opencode", "review-rules.json"),
      path.join(Instance.directory, "review-rules.yaml"),
      path.join(Instance.directory, "review-rules.json"),
    ]

    for (const configPath of configPaths) {
      try {
        const exists = await fs.access(configPath).then(() => true).catch(() => false)
        if (!exists) continue

        const content = await fs.readFile(configPath, "utf-8")
        let parsed: unknown

        if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
          // Dynamic import for YAML parsing
          const yaml = await import("js-yaml")
          parsed = yaml.load(content)
        } else {
          parsed = JSON.parse(content)
        }

        const result = Config.safeParse(parsed)
        if (result.success) {
          log.info("loaded review rules", { path: configPath, count: result.data.rules.length })
          return [...DEFAULT_RULES, ...result.data.rules]
        } else {
          log.warn("invalid review rules config", { path: configPath, issues: result.error.issues })
        }
      } catch (e) {
        log.warn("failed to load review rules", { path: configPath, error: e })
      }
    }

    log.info("using default review rules", { count: DEFAULT_RULES.length })
    return DEFAULT_RULES
  }

  /**
   * Match changed files against rules to determine which rules apply
   */
  export async function match(changedFiles: string[], rules: Rule[]): Promise<Rule[]> {
    const matchedRules: Rule[] = []

    for (const rule of rules) {
      for (const pattern of rule.trigger.patterns) {
        const glob = new Bun.Glob(pattern)
        for (const file of changedFiles) {
          if (glob.match(file)) {
            if (!matchedRules.includes(rule)) {
              matchedRules.push(rule)
              log.info("rule matched", { rule: rule.name, file, pattern })
            }
            break
          }
        }
      }
    }

    return matchedRules
  }
}
