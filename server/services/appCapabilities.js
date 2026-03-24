/**
 * Curated app knowledge for the AI assistant (keep in sync with product behavior).
 */
export const APP_CAPABILITIES_MARKDOWN = `
# NoteTasks — App capabilities (authoritative)

## Navigation (sidebar tabs)
- **Pool**: All active notes and tasks together. List / table / canvas views. **Add Note** / **Add Task** jump to Notes or Tasks and open the create modal.
- **Schedule**: (1) **Daily** notes/tasks (\`daily: true\`) — the same item every calendar day, time-only deadline HH:mm. (2) **Schedule templates** — recurring **per weekday** (one weekday per template, e.g. every Monday) or **yearly date** (MM-DD). Templates **materialize** matching items on that day; they are **not** the same as a single daily task.
- **Notes**: Note-centric workspace with trees (subnotes and subtasks). Canvas positions for root notes.
- **Tasks**: Task-centric workspace with progress toward a **target**; tasks can nest under notes or tasks.
- **Completed**: Completed notes/tasks; bulk delete; recover.
- **Assistant** (this tab): Chat with the AI; on desktop the chat can stay open as a side panel when you switch tabs.

## Schedule templates vs daily items
- **Daily item** (\`create_task\` / \`create_note\` with \`daily: true\`): appears **every day** on Schedule — including weekends.
- **Weekday-only (e.g. Mon–Fri)**: use **\`create_schedule_template\`** with \`weekdays: ["monday",…,"friday"]\` or \`weekday_preset: "monday_to_friday"\`. The app stores **one template per weekday** (e.g. five templates for Mon–Fri) with the same task/note definitions.
- **Single weekday** (e.g. every Wednesday): one template with \`schedule_kind: "weekday"\` and \`schedule_value: "wednesday"\`.
- **Yearly** (e.g. every Dec 25): \`schedule_kind: "date"\`, \`schedule_value: "12-25"\` (MM-DD).

## Items model
- **Notes** and **tasks** can be nested under each other via \`parentId\` + \`parentType\` (\`note\` | \`task\`).
- **Daily** items appear on Schedule; \`deadline\` for daily is **time only** (\`HH:mm\`). Non-daily deadlines use local datetime strings.
- Completing a parent **cascades** completion to all descendant notes and tasks.
- Deleting cascades to descendants in the UI.

## Settings
- Theme, UI density, font size, **daily reset time**, local import, version, **re-run tutorial**.
- **Allow AI to edit data**: when off, the assistant only chats/plans and cannot create/edit/delete items.

## Notifications
- Includes a reminder if **Completed** stays non-empty for several days (stale completed tab).

## Tutorial
- Guided tour across tabs and settings until finished; can be re-run from Settings.

## Assistant behavior (policy)
- **Deletes** always require user confirmation in the UI before execution.
- Create/update runs automatically only when the user's message shows **clear intent** to change data; otherwise the UI asks for confirmation.
- When the assistant acts on notes/tasks/schedule-related items, the app may navigate to the relevant tab and keep the assistant panel open on desktop.
`.trim();
