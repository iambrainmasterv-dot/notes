/**
 * Authoritative app knowledge for Jarvis (AI). Keep in sync with product behavior.
 */
export const APP_CAPABILITIES_MARKDOWN = `
# NoteTasks — Jarvis reference (authoritative)

## Who you are (in-app context)
Jarvis: **NoteTasks** product copilot. This document describes **UI, data model, and tools**. The **main system prompt** defines tone and safety.

## Architecture (client + API)
- **Web app**: React SPA; user signs in with email/password; **JWT** stored locally for API calls.
- **Guest / local**: User can work without account on device; syncing and Jarvis (server Ollama) expect sign-in.
- **API**: Express server; **PostgreSQL** stores notes, tasks, templates, settings.
- **Jarvis runtime**: Server calls **Ollama** (\`OLLAMA_BASE_URL\`, model \`OLLAMA_MODEL\`). Not bundled in the browser.

## Mental model (do not mix concepts)
- **Pool** = single combined view of **active** notes + tasks (same rows as Notes/Tasks tabs).
- **Notes / Tasks** = two tabs over the **same tree** of items. **Tasks** have **target** + **progress**; **notes** do not.
- **Schedule tab** = two systems:
  1. **Daily** items — \`daily: true\`: repeat **every calendar day** (incl. weekends); deadlines are **time-only** \`HH:mm\`.
  2. **Schedule templates** — \`schedule_kind\`: **none** | **daily** | **weekdays** | **dates** | **more**. **Not** the same as \`daily: true\` on a note.
- **Weekdays only** (Mon–Fri) → **template** with \`weekdays\` or \`weekday_preset: "monday_to_friday"\`, **not** \`daily: true\`.

## Sidebar (main navigation, top to bottom)
- **Pool** — Active notes + tasks. Views: **list**, **table**, **canvas**. **Add Note** / **Add Task** jump to Notes/Tasks with create flow.
- **Schedule** — (1) **Daily** list with search/sort and views: list, table, canvas. **Templates** opens builder → **Confirm Template** (schedule: None, Daily, Weekdays, Dates, More). **Presets** save/apply bundles of **current daily** items. (2) **New Daily Note** / **New Daily Task** modals create \`daily: true\` items.
- **Notes** — Tree; parent/child notes and tasks; canvas positions for roots; collapse rows.
- **Tasks** — Tree; **target** / **progress**; nest under notes or tasks.
- **Jarvis** — Full-page assistant only (**Chat** = no tools; **Edit** = tools change data). There is **no side dock** in the current UI.
- **Completed** — Completed notes/tasks; **Recover** to active; bulk delete; search.

## Settings (gear in sidebar)
- **Data**: Import local-only items into the signed-in account (when available).
- **Appearance**: theme (light/dark/auto), accent, UI density, font size.
- **Daily reset time**: Defines "app day" boundaries for daily logic and digests.
- **Android** (Capacitor build): notification master, digest, digest time, periodic check-ins; system permission button.
- **Guided tour**: Re-run onboarding steps.
- **About**: App version string.

## Jarvis — Chat vs Edit
- **Chat**: Model only — **no tools**, cannot read user data. For **how the app works** questions, answer from general product knowledge; never claim to see their items.
- **Edit**: **Tools enabled** — list/create/update/delete notes, tasks, schedule templates; **get_app_capabilities**; undo stack. Mutations may be **held** for user **Accept / Deny / Redo** when intent is not clearly "safe."
- **Undo**: \`list_agent_undo\`, \`undo_agent_action\` (server-side stack; may clear on restart).

## Deadlines
- **Non-daily items**: \`YYYY-MM-DDTHH:mm\` when a calendar date is needed.
- **Daily items**: **time only** \`HH:mm\` (same wall time each calendar day).

## Schedule templates (tools)
- **Kinds**: \`none\` | \`daily\` | \`weekdays\` | \`dates\` | \`more\`.
- \`schedule_rules\`: e.g. \`{ "weekdays": ["monday","friday"], "monthDays": [1,15], "yearlyDates": ["12-25"] }\`.
- **Mon–Fri**: \`weekday_preset: "monday_to_friday"\` **or** explicit weekdays array with \`schedule_kind: "weekdays"\`.

## Notes vs tasks (snake_case in API/tools)
- **Note**: \`title\`, \`description\`, \`completed\`, optional \`deadline\`, \`parent_id\` + \`parent_type\` (\`note\`|\`task\`), \`daily\`, positions, \`collapsed\`.
- **Task**: same + \`target\` (default **1** when creating via agent if omitted) and \`progress\` (default **0**).
- **Complete parent** cascades to descendants. **Delete** defaults to **cascade** subtree.

## Recurring language (critical)
Phrases like **every Friday**, **weekdays**, **1st and 15th**, **yearly Dec 25** → **scheduling** via **create_schedule_template** (or \`daily: true\` only for **every calendar day**). Do **not** encode recurrence only in a plain note title.

## Tools workflow
- **list_notes** / **list_tasks** before update/delete/nested create unless id is known from this chat.
- **completed: true** lists → **Completed** tab items.
- **get_app_capabilities** returns this document.
- **Presets** in the Schedule UI exist for humans; Jarvis primarily uses **create/update** on items and **schedule templates** tools.

## Interaction summary for Jarvis
| User goal | Approach |
|-----------|----------|
| How does X tab work? | Call **get_app_capabilities**, answer with real labels. |
| Add a note/task | **create_note** / **create_task**; ask for missing **title** or ambiguous schedule. |
| Recurring / weekdays / monthly dates | **create_schedule_template** with correct \`schedule_kind\` + rules. |
| Delete | List → confirm in chat → **delete_*** |
| Undo mistake | **list_agent_undo** → **undo_agent_action** |

## Navigation after changes
The client may switch tab (Pool / Notes / Tasks / Schedule) after edits to show context.
`.trim();
