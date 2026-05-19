# LLM Directive: Writing Modular, Maintainable Code

## Core Principle
**NEVER create files exceeding 250 lines. Target 200 lines or fewer per file.**

When code approaches 200 lines, STOP and refactor into smaller, focused modules.

---

## The Modularity Mandate

### Why Modular Code Matters
- **Cognitive Load**: Humans can comprehend ~200 lines at once
- **Testability**: Smaller units are easier to test in isolation
- **Maintainability**: Changes are localized and predictable
- **Reusability**: Focused modules can be reused across projects
- **Debugging**: Smaller surface area means faster bug identification
- **Collaboration**: Multiple developers can work on different modules simultaneously

### The Problem with Monolithic Files
❌ Giant single files that:
- Mix multiple responsibilities
- Create tight coupling between unrelated concerns
- Make testing difficult
- Require scrolling through hundreds of lines to understand
- Create merge conflicts in team environments
- Obscure the actual business logic in noise

---

## File Size Enforcement Rules

### Hard Limits
1. **250 lines maximum** per file (including imports, exports, comments)
2. **200 lines target** - if approaching this, start planning refactor
3. **150 lines ideal** for most modules

### When You Hit the Limit
```
IF file_length > 200 THEN
  STOP coding
  ANALYZE responsibilities
  EXTRACT functions/classes into separate files
  CREATE a clear module structure
  RESUME with modular approach
END IF
```

---

## Modular Code Architecture Patterns

### 1. Single Responsibility Principle (SRP)
Each file should have ONE clear purpose:

**Good Examples:**
- `userValidation.ts` - validates user input only
- `emailService.ts` - handles email operations only
- `dateFormatter.ts` - formats dates only

**Bad Examples:**
- `utils.ts` - everything that doesn't fit elsewhere
- `helpers.ts` - miscellaneous unrelated functions
- `main.ts` - 800 lines doing everything

### 2. Separation of Concerns

**Separate by layer:**
```
/models          - Data structures and types
/services        - Business logic
/controllers     - Request/response handling
/repositories    - Data access
/utils           - Pure utility functions
/validators      - Input validation
/transformers    - Data transformation
/formatters      - Output formatting
```

**File naming convention:**
- `[domain].[responsibility].ts`
- Example: `user.validation.ts`, `calendar.service.ts`, `event.repository.ts`

### 3. Vertical Slicing by Feature

Instead of horizontal layers, group by feature:
```
/features
  /authentication
    - auth.service.ts      (100 lines)
    - auth.validation.ts   (80 lines)
    - auth.types.ts        (50 lines)
    - auth.test.ts         (150 lines)
  /calendar-sync
    - sync.service.ts      (180 lines)
    - sync.repository.ts   (120 lines)
    - sync.types.ts        (60 lines)
```

### 4. Composition Over Inheritance

Build complex functionality by composing small modules:

```typescript
// ❌ BAD: 500-line God class
class CalendarManager {
  validateEvent() { /* 50 lines */ }
  syncEvents() { /* 100 lines */ }
  handleConflicts() { /* 80 lines */ }
  formatOutput() { /* 60 lines */ }
  sendNotifications() { /* 90 lines */ }
  updateDatabase() { /* 120 lines */ }
}

// ✅ GOOD: Composed from focused modules
// eventValidator.ts (50 lines)
export function validateEvent(event: Event): ValidationResult { }

// eventSync.ts (100 lines)
export function syncEvents(events: Event[]): Promise<SyncResult> { }

// conflictResolver.ts (80 lines)
export function resolveConflicts(conflicts: Conflict[]): Resolution { }

// calendarManager.ts (60 lines - orchestration only)
import { validateEvent } from './eventValidator'
import { syncEvents } from './eventSync'
import { resolveConflicts } from './conflictResolver'

export class CalendarManager {
  async process(events: Event[]) {
    const validated = events.map(validateEvent)
    const synced = await syncEvents(validated)
    return resolveConflicts(synced.conflicts)
  }
}
```

---

## Practical Refactoring Strategies

### Strategy 1: Extract Related Functions
```typescript
// BEFORE: user.ts (300 lines)
function validateEmail() { }
function validatePassword() { }
function validateUsername() { }
function createUser() { }
function deleteUser() { }
function updateUser() { }
// ... 200 more lines

// AFTER: Split into focused modules
// user.validation.ts (90 lines)
// user.service.ts (120 lines)
// user.repository.ts (90 lines)
```

### Strategy 2: Extract Constants and Types
```typescript
// constants.ts (40 lines)
export const MAX_FILE_SIZE = 5 * 1024 * 1024
export const ALLOWED_EXTENSIONS = ['.jpg', '.png']

// types.ts (60 lines)
export interface User { }
export interface Event { }
export type SyncStatus = 'pending' | 'completed' | 'failed'

// main.service.ts (150 lines)
import { MAX_FILE_SIZE, ALLOWED_EXTENSIONS } from './constants'
import { User, Event, SyncStatus } from './types'
```

### Strategy 3: Extract Configuration
```typescript
// config.ts (50 lines)
export const config = {
  database: { /* ... */ },
  api: { /* ... */ },
  sync: { /* ... */ }
}

// service.ts (120 lines)
import { config } from './config'
```

### Strategy 4: Extract Error Handling
```typescript
// errors.ts (80 lines)
export class ValidationError extends Error { }
export class SyncError extends Error { }
export function handleError(error: Error): ErrorResponse { }

// service.ts (140 lines)
import { ValidationError, handleError } from './errors'
```

### Strategy 5: Extract Utilities
```typescript
// dateUtils.ts (60 lines)
export function formatDate(date: Date): string { }
export function parseDate(str: string): Date { }

// stringUtils.ts (50 lines)
export function capitalize(str: string): string { }
export function truncate(str: string, length: number): string { }
```

---

## Decision Tree: When to Split a File

```
Start: Writing code in a file
  |
  ├─> Line count < 150?
  |     └─> Continue coding ✓
  |
  ├─> Line count 150-200?
  |     └─> Review for natural split points
  |           ├─> Can extract types/constants?
  |           ├─> Can extract utilities?
  |           └─> Can separate responsibilities?
  |
  └─> Line count > 200?
        └─> MANDATORY refactor
              1. Identify distinct responsibilities
              2. Create new files for each responsibility
              3. Extract and organize
              4. Update imports/exports
              5. Verify tests still pass
```

---

## Module Interface Design

### Export Only What's Needed
```typescript
// ✅ GOOD: Clear public interface
// userService.ts
export function createUser() { }  // Public API
export function deleteUser() { }  // Public API

function validateInternal() { }   // Private helper
function sanitizeInternal() { }   // Private helper

// ❌ BAD: Exports everything
export function internalHelper1() { }
export function tempDebugFunction() { }
export function unused() { }
```

### Use Index Files for Clean Imports
```typescript
// /services/index.ts
export { createUser, deleteUser } from './userService'
export { syncCalendar } from './calendarService'
export { sendEmail } from './emailService'

// Consumer code
import { createUser, syncCalendar } from '@/services'
// Instead of:
// import { createUser } from '@/services/userService'
// import { syncCalendar } from '@/services/calendarService'
```

---

## Testing Modular Code

### Benefits of Testing Small Modules
```typescript
// ✅ Easy to test (60 lines)
// emailValidator.ts
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// emailValidator.test.ts
describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
  })

  it('rejects invalid emails', () => {
    expect(isValidEmail('invalid')).toBe(false)
  })
})

// ❌ Difficult to test (500 lines)
// UserManager.ts - too many dependencies, side effects, concerns mixed
```

### Test File Organization
- Test files can be longer (250-400 lines acceptable)
- One test file per module
- Group related tests with `describe` blocks

---

## Anti-Patterns to Avoid

### ❌ The God File
```
utils.ts (800 lines)
- Everything that doesn't fit elsewhere
- Impossible to understand what it does
- Creates circular dependencies
```

### ❌ The Junk Drawer
```
helpers.ts (600 lines)
- Random unrelated functions
- "I'll organize this later" (never happens)
- No coherent purpose
```

### ❌ The Copy-Paste Paradise
```
Multiple 400-line files with duplicated code
- Should have extracted common functionality
- Violates DRY principle
```

### ❌ The Premature Abstraction
```
50 files, each with 10 lines
- Over-engineering
- Too granular
- Hard to understand the big picture
```

---

## Implementation Checklist

Before writing ANY code, ask:
- [ ] What is the single responsibility of this file?
- [ ] Can I describe this file's purpose in one sentence?
- [ ] Are there any secondary concerns that should be in separate files?
- [ ] Will this file exceed 200 lines?
- [ ] If yes, how can I break it down NOW?
- [ ] What are the natural boundaries for splitting?
- [ ] Are my imports from more than 3-4 different domains? (sign of mixed concerns)

While writing code:
- [ ] Current line count < 150? Continue
- [ ] Current line count 150-200? Plan refactor
- [ ] Current line count > 200? Stop and refactor immediately

After writing code:
- [ ] Is each module testable in isolation?
- [ ] Are dependencies explicit and minimal?
- [ ] Can another developer understand this file in 5 minutes?
- [ ] Would I be comfortable reviewing this in a PR?

---

## Real-World Examples

### Example 1: Calendar Sync Service

**❌ BEFORE: sync.ts (650 lines)**
```typescript
// Mixed: API calls, validation, business logic, database, formatting, error handling
export async function syncCalendar(userId: string) {
  // 100 lines of validation
  // 200 lines of API calls
  // 150 lines of business logic
  // 100 lines of database operations
  // 100 lines of error handling
}
```

**✅ AFTER: Modular structure**
```
/calendar-sync
  - types.ts (60 lines)              // Interfaces and types
  - validation.ts (90 lines)         // Input validation
  - apiClient.ts (180 lines)         // External API calls
  - syncEngine.ts (160 lines)        // Core sync logic
  - repository.ts (140 lines)        // Database operations
  - formatter.ts (70 lines)          // Output formatting
  - errors.ts (50 lines)             // Error types
  - index.ts (40 lines)              // Public API orchestration
```

### Example 2: Event Processing

**❌ BEFORE: eventProcessor.ts (480 lines)**
```typescript
function processEvent(event: RawEvent) {
  // Parsing
  // Validation
  // Transformation
  // Enrichment
  // Filtering
  // Storage
}
```

**✅ AFTER: Pipeline pattern**
```
/event-processing
  - parser.ts (80 lines)        // Parse raw events
  - validator.ts (90 lines)     // Validate events
  - transformer.ts (100 lines)  // Transform to canonical format
  - enricher.ts (110 lines)     // Add metadata
  - filter.ts (70 lines)        // Filter unwanted events
  - repository.ts (120 lines)   // Store events
  - pipeline.ts (60 lines)      // Orchestrate the pipeline
```

---

## Code Review Criteria

When reviewing code (your own or others), reject if:
- ❌ Any file exceeds 250 lines
- ❌ File has more than 3 distinct responsibilities
- ❌ Cannot describe file's purpose in one sentence
- ❌ File name is generic (utils.ts, helpers.ts, common.ts)
- ❌ Excessive cognitive load to understand

Approve if:
- ✅ Files are 200 lines or fewer
- ✅ Clear single responsibility per file
- ✅ Well-named, descriptive file names
- ✅ Clean imports and exports
- ✅ Easily testable in isolation
- ✅ Can be understood in < 5 minutes

---

## Summary: The Modular Code Contract

**AS AN AI CODE ASSISTANT, I COMMIT TO:**

1. **Never exceed 250 lines per file**
2. **Target 200 lines or fewer**
3. **Stop and refactor at 200 lines**
4. **Create files with single, clear responsibilities**
5. **Name files descriptively** (`user.validation.ts` not `utils.ts`)
6. **Separate concerns** into different files
7. **Compose complex functionality** from simple modules
8. **Make code testable** by keeping modules focused
9. **Prioritize readability** over brevity
10. **Ask "Can this be split?" before answering "Is this done?"**

**MANTRA:**
> "If I cannot explain this file's purpose in one sentence, it needs to be split."
> "If this file exceeds 200 lines, I stop and refactor."
> "Small, focused modules are always better than large, complex files."

---

## Prompt Template for LLMs

When starting a new coding task, include:

```
CODING STANDARDS:
- Maximum 250 lines per file (hard limit)
- Target 200 lines per file (preferred)
- One clear responsibility per file
- Stop and refactor if approaching 200 lines
- No generic file names (utils.ts, helpers.ts)
- Separate concerns into distinct modules
- Compose complexity from simple parts

Before writing code, identify:
1. What modules/files are needed?
2. What is each file's single responsibility?
3. How will they compose together?
```

---

## Resources for Further Study

### Principles
- **Single Responsibility Principle (SRP)** - Each module does one thing well
- **Separation of Concerns (SoC)** - Different concerns in different files
- **Dependency Inversion Principle (DIP)** - Depend on abstractions, not concretions
- **Interface Segregation Principle (ISP)** - Many specific interfaces > one general
- **DRY (Don't Repeat Yourself)** - Extract common code to shared modules

### Patterns
- **Module Pattern** - Encapsulation and clear interfaces
- **Facade Pattern** - Simple interface to complex subsystems
- **Strategy Pattern** - Interchangeable algorithms
- **Repository Pattern** - Data access abstraction
- **Factory Pattern** - Object creation abstraction

### Architectural Approaches
- **Feature-Sliced Design** - Organize by feature, not layer
- **Clean Architecture** - Dependency rules and layer separation
- **Hexagonal Architecture** - Ports and adapters for decoupling
- **Microservices Mindset** - Even in a monolith, think in bounded contexts

---

*Last Updated: 2025-11-13*
*Version: 1.0*
