# LLM Directive: Writing Modular, Maintainable Code

## Core Principle
**NEVER create files exceeding 250 lines. Target 200 lines or fewer per file.**

When code approaches 200 lines, STOP and refactor into smaller, focused modules.

---

## Why Modular Code Matters

**Benefits:**
- **Cognitive Load**: Humans comprehend ~200 lines at once
- **Testability**: Smaller units are easier to test in isolation
- **Maintainability**: Changes are localized and predictable
- **Debugging**: Smaller surface area means faster bug identification

**Problems with Monolithic Files:**
- Mix multiple responsibilities
- Create tight coupling between unrelated concerns
- Difficult to test and understand
- Create merge conflicts in team environments

---

## File Size Enforcement

### Hard Limits
1. **250 lines maximum** per file (hard limit)
2. **200 lines target** - start planning refactor
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

## Core Principles

### 1. Single Responsibility Principle (SRP)
Each file should have ONE clear purpose.

**Good:** `userValidation.ts`, `emailService.ts`, `dateFormatter.ts`
**Bad:** `utils.ts`, `helpers.ts`, `main.ts` (doing everything)

### 2. Separation of Concerns

Organize by layer or feature:
```
/models          - Data structures and types
/services        - Business logic
/repositories    - Data access
/validators      - Input validation
/formatters      - Output formatting
```

**Naming convention:** `[domain].[responsibility].ts`
Examples: `user.validation.ts`, `calendar.service.ts`, `event.repository.ts`

### 3. Composition Over Inheritance

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

// calendarManager.ts (60 lines - orchestration only)
import { validateEvent } from './eventValidator'
import { syncEvents } from './eventSync'

export class CalendarManager {
  async process(events: Event[]) {
    const validated = events.map(validateEvent)
    return await syncEvents(validated)
  }
}
```

---

## Refactoring Strategies

When a file grows too large, extract:

1. **Related Functions** - Group by responsibility (validation, service, repository)
2. **Types & Constants** - Separate into `types.ts`, `constants.ts`
3. **Configuration** - Extract to `config.ts`
4. **Error Handling** - Create `errors.ts` with custom error classes
5. **Utilities** - Domain-specific utils (not generic `utils.ts`)

**Example:**
```typescript
// BEFORE: user.ts (300 lines)
// AFTER:
//   user.validation.ts (90 lines)
//   user.service.ts (120 lines)
//   user.repository.ts (90 lines)
```

---

## Decision Tree: When to Split

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
              2. Create new files for each
              3. Extract and organize
              4. Update imports/exports
              5. Verify tests still pass
```

---

## Module Interface Design

**Export only what's needed:**
```typescript
// ✅ GOOD: Clear public interface
export function createUser() { }  // Public API
export function deleteUser() { }  // Public API

function validateInternal() { }   // Private helper
```

**Use index files for clean imports:**
```typescript
// /services/index.ts
export { createUser, deleteUser } from './userService'
export { syncCalendar } from './calendarService'

// Consumer code
import { createUser, syncCalendar } from '@/services'
```

---

## Anti-Patterns to Avoid

### ❌ The God File
`utils.ts` (800 lines) - Everything that doesn't fit elsewhere

### ❌ The Junk Drawer
`helpers.ts` (600 lines) - Random unrelated functions

### ❌ The Copy-Paste Paradise
Multiple 400-line files with duplicated code

### ❌ The Premature Abstraction
50 files with 10 lines each - Over-engineering

---

## Implementation Checklist

**Before writing code:**
- [ ] What is the single responsibility of this file?
- [ ] Can I describe this file's purpose in one sentence?
- [ ] Will this file exceed 200 lines?
- [ ] How can I break it down NOW?

**While writing code:**
- [ ] Line count < 150? Continue
- [ ] Line count 150-200? Plan refactor
- [ ] Line count > 200? Stop and refactor immediately

**After writing code:**
- [ ] Is each module testable in isolation?
- [ ] Are dependencies explicit and minimal?
- [ ] Can another developer understand this file in 5 minutes?

---

## Real-World Example: Calendar Sync Service

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

---

## Code Review Criteria

**Reject if:**
- ❌ Any file exceeds 250 lines
- ❌ File has more than 3 distinct responsibilities
- ❌ Cannot describe file's purpose in one sentence
- ❌ File name is generic (utils.ts, helpers.ts, common.ts)

**Approve if:**
- ✅ Files are 200 lines or fewer
- ✅ Clear single responsibility per file
- ✅ Well-named, descriptive file names
- ✅ Easily testable in isolation

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

*Last Updated: 2025-11-13 • Version: 2.0 (Condensed)*
