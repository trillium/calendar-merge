### LLM INSTRUCTIONS

reference file: llm-refactor-instructions.md

To complete a migration step, you may use any of the following instructions:
• "Stage and commit all changes for the current migration task."
• "Mark the checklist and commit the semantic chunk."
• "Finish the current migration step and update the checklist."
• "Complete the current todo and commit."

When you see one of these, automatically:

1. Commit the code changes for the current migration step with a semantic message.
2. Update the checklist to mark the step as complete.
3. Stage and commit the checklist update as a semantic chunk.

You do not need to ask for permission to update the checklist or commit—just do it as part of the migration workflow.

You are in `turbo-mode` which means you do not need to ask for permission to complete the tasks set forth here

# Next.js App Refactor Task Plan

This plan will guide you through refactoring `app/page.tsx` into small, reusable, and well-organized chunks, following the best practices in `llm-refactor-instructions.md`.

**Important:**  
After completing each task, stage and commit your changes before moving to the next task. This ensures a clean, reviewable history and makes it easy to revert or debug if needed.

---

## Task List

1. **Create `/ui`, `/hooks`, and `/lib` folders**

   - Add `app/ui/`, `app/hooks/`, and `app/lib/` directories for components, hooks, and utility functions.
   - _Commit: “chore: create ui, hooks, and lib folders for refactor”_

2. **Extract UI Components**

   - Move presentational parts of `page.tsx` (e.g., calendar list, stepper, status messages, connect button) into separate components in `app/ui/`.
   - Example components: `CalendarList.tsx`, `Stepper.tsx`, `StatusMessage.tsx`, `ConnectButton.tsx`.
   - _Commit: “refactor: extract UI components from page.tsx”_

3. **Extract Custom Hooks** ✅

   - Move stateful and effect logic (OAuth, calendar fetching, setup logic) into custom hooks in `app/hooks/`.
   - Example hooks: `useOAuth.ts`, `useCalendars.ts`, `useSetupSync.ts`.
   - _Commit: “refactor: extract custom hooks from page.tsx”_

4. **Extract Utility Functions** ✅

   - Move API calls and utility logic (e.g., API URL construction, calendar utilities) into `app/lib/`.
   - Example: `api.ts`, `calendarUtils.ts`.
   - _Commit: “refactor: extract utility functions from page.tsx”_

5. **Refactor `page.tsx` to Compose Components** ✅

   - Refactor `page.tsx` to import and compose the new UI components and hooks.
   - Ensure `page.tsx` is minimal, only responsible for layout and composition.
   - _Commit: “refactor: simplify page.tsx to use new components and hooks”_

6. **Test the Refactored Page**

   - Manually test the app to ensure all functionality works as before.
   - Add or update tests if present.
   - _Commit: “test: verify and update tests after refactor”_

7. **Review and Final Cleanup**
   - Review the new structure for clarity, reusability, and adherence to best practices.
   - Remove any unused code from the old `page.tsx`.
   - _Commit: “chore: cleanup and finalize refactor”_

---

## Example Directory Structure After Refactor

```
app/
  page.tsx
  layout.tsx
  ui/
    CalendarList.tsx
    Stepper.tsx
    StatusMessage.tsx
    ConnectButton.tsx
  hooks/
    useOAuth.ts
    useCalendars.ts
    useSetupSync.ts
  lib/
    api.ts
    calendarUtils.ts
```

---

## References

- See `llm-refactor-instructions.md` for detailed best practices and rationale.
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#separating-server-and-client-components)

---

**Remember:**  
_Commit after each task to ensure a clean, incremental refactor process._

You are in `turbo-mode` which means you do not need to ask for permission to complete the tasks set forth here
