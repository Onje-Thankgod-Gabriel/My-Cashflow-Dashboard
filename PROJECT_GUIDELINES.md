# Gabsweb CashFlow — Project Guidelines

This document is the permanent decision record for the Gabsweb CashFlow frontend. Read it before starting any task and update it whenever an approved design, behaviour, correction or technical decision is established.

## 1. Product Direction

- Gabsweb CashFlow is a personal financial management and productivity application.
- The existing SavvyFi template supplies the shell and visual foundation, but transformed pages must be purpose-built rather than re-labelled template cards.
- The interface must feel like a calm, professional financial application with clear hierarchy, useful financial indicators and restrained decoration.
- Preserve the Inter typeface, existing global colour tokens, themes, sidebar, header and mobile bottom navigation.
- Keep HTML, CSS and JavaScript separate. Use page-specific CSS and JavaScript where practical.

## 2. Global Interface Rules

- Never use vertical left-side accent lines on toasts, ordinary cards, information cards, notification cards or any new component.
- Do not add generic AI-style decorative patterns, excessive gradients, ornamental blobs or unnecessary chart decoration.
- Use clean card composition, consistent spacing, aligned financial values and clear primary/secondary actions.
- All visible controls must work. Do not ship placeholder buttons or false success messages.
- Use application modals, toasts and confirmation patterns. Never use browser `alert`, `prompt` or `confirm`.
- Keep destructive actions behind an explicit confirmation and report failures honestly.
- Preserve responsive behaviour at desktop, laptop, tablet and mobile widths. Avoid horizontal overflow, clipped amounts and content hidden behind the mobile bottom navigation.
- Preserve dark and light theme compatibility. Every new surface must use existing tokens rather than hard-coded page-level colours.
- On mobile and tablet, provide access to the existing sidebar through a compact header menu button. Reuse the sidebar, close button and overlay; lock page scrolling while open and close it through the overlay, Escape, close button or navigation link. Keep header controls non-shrinking and allow only the title area to yield space on narrow screens.
- Mobile sidebar opening and closing must use a smooth transform-based slide and overlay fade rather than changing layout position abruptly.

## 3. Architecture and Data Rules

- `assets/js/cashflow-data.js` is the single source of truth and exposes `window.GabswebCashFlowData`.
- Storage key is `gabsweb-cashflow-data`; default currency is `NGN`; initial financial date is `2026-11-01`.
- Do not add a second financial storage key, directly mutate localStorage records, or duplicate core financial calculations.
- Use public data-layer methods and supported signatures. If a required relationship is missing, document the gap before changing the shared layer.
- Income increases account balances. Expenses decrease balances. Transfers preserve total wealth and are excluded from income/expense totals. Opening balances are not income.
- Allocations are plans, not expenses. Creating an allocation must not change account balances or create an expense.
- Actual allocation spending comes only from real expense transactions explicitly linked to that allocation.
- Unlinked expenses remain ordinary expenses and must never be silently assigned to an allocation.
- Unallocated funds use the central formula `monthly income - total allocated`; do not change it silently.
- Do not modify `assets/js/index.js`, global fonts or colour tokens.
- Do not introduce frameworks, backend requests, fake server workflows or unnecessary dependencies.
- Authentication pages remain frontend-only until Django integration. They must use Gabsweb CashFlow branding, retain the approved template card/layout treatment, validate user input honestly, and never store passwords or claim successful authentication/account creation without a backend.
- Password recovery uses `password-reset.html`, `password-reset-done.html`, `password-reset-confirm.html` and `password-reset-complete.html`. These pages share the approved authentication styling, use privacy-preserving reset messaging, validate only safe frontend fields, and remain prepared for Django's `PasswordResetView`, `PasswordResetDoneView`, `PasswordResetConfirmView` and `PasswordResetCompleteView` without simulating tokens, emails or password changes.
- All authentication pages include the shared top-right theme toggle. It uses the existing `savvyfi-theme` preference and `light`/`dark` document classes so theme choice persists between authentication pages.
- Authentication visual consistency rules: use the shared `assets/css/auth.css` tokens and controls, keep the 20px card radius, rounded logo treatment, balanced vertical spacing, 48px primary/Google buttons, and responsive mobile padding. Do not reintroduce the removed curved SVG background.
- Authentication link hierarchy: account navigation links such as Create an account, Sign in, Forgot password and Terms and conditions must be visibly prominent in both themes. Dark mode requires explicit readable link, border and hover colors; do not rely on light-theme indigo values.
- Authentication form validation rules: inputs must use `var(--text)` for typed values and `var(--panel)` for autofill backgrounds in both themes. Status and warning messages require explicit dark-theme contrast colors. Reset-request actions need clear separation below the email field, and password guidance needs deliberate spacing before the submit button.
- Authentication verification rule: after any auth change, load every auth page at desktop and narrow mobile widths, test both light and dark themes, verify toggle persistence, links, validation and password controls, and check for horizontal overflow. Shared scripts must be included on every page that has interactive controls.
- Password-reset email files under `templates/emails/` are static design references only. Their reset action must use the working frontend path `../../password-reset-confirm.html`, and the HTML email must keep the approved logo embedded as an inline PNG so it displays without a backend or external asset server. They must not contain Django template syntax, server-side URL tags, token handling, or email-delivery code until a backend implementation is explicitly requested.
- Error pages use `400.html`, `403.html`, `404.html` and `500.html` with shared `assets/css/error-pages.css` and `assets/js/error-pages.js`. They preserve the authentication card language, logo, theme toggle, prominent status code above a restrained icon, and responsive action layout. Each page exposes only one action: `Back to Dashboard`, using `index.html`.
- The complete Daily To-Do Planner and Project Planner belong on `planner.html`. The Dashboard contains only compact, shared-data summaries with links to `planner.html`; it must not retain full task, appointment, notes, project or milestone management interfaces. Planner and Dashboard must continue using `assets/js/cashflow-data.js` as the single source of truth.
- Planner rerenders that replace task, priority or appointment markup must call the shared Lucide icon refresh after rendering. This preserves all icons after editing or saving daily notes without changing planner data behavior.
- Daily Notes and Daily Remarks controls use compact pill-style Edit/Add buttons with clear light/dark focus and hover states; their Save buttons use the shared primary action treatment with matching compact sizing.
- `terms.html` and `privacy-policy.html` are the current frontend legal-document references. They must describe the browser-local-storage architecture and frontend-only authentication honestly, keep effective/updated dates as explicit confirmation placeholders until supplied, avoid invented legal contact details, and use direct links between the two pages rather than pending-document warning text.
- All application pages load `assets/css/typography.css` after their page-specific styles. The shared readability scale uses approximately 15px for ordinary desktop body/supporting copy, 14px for ordinary mobile copy, 14px for compact desktop metadata, 13px for compact mobile metadata, 14px for desktop controls and 13px for mobile controls. The existing compact bottom navigation remains at its original 0.68rem/0.72rem/0.61rem responsive sizes, and top welcome text remains modest at about 13px desktop and 12px mobile. Display values, headings, icons and intentional financial emphasis remain page-specific. New components must not introduce tiny text below this scale without a documented space constraint.
- Error pages must keep messages safe and user-friendly, without stack traces, permission details, server information, financial-data claims or fake success states. The current static frontend has no Support route, so Support actions must report that limitation honestly rather than inventing a destination. Future Django integration must connect these files to `handler400`, `handler403`, `handler404` and `handler500` and return the matching HTTP status codes; the backend is not configured by the frontend task.

## 4. Implemented Features

- Task 01: Shared frontend financial data foundation.
- Task 02: Settings and Preferences page.
- Task 03: My Finances page with accounts, income, expenses, transfers, searchable/filterable/sortable history, pagination, linked expense support and persistent local data.
- Task 04: Budget & Money Allocation page using allocation plans linked to actual expense records.
- Task 05: Goals & Planned Purchases page using goal records funded only through linked savings plans, with CRUD, Add Funds, savings analysis and milestone deadlines.
- Task 06: Savings page using real savings plans and contribution/withdrawal movements, with plan CRUD, goal links, balance history, activity filters and calculated insights.
- Task 07: Work Schedule page using confirmed work records, month/week/list calendars, selected-date details, rotation settings, entry CRUD and upcoming/previous history.
- Task 08: Reports & Insights page using period reports, income/expense analysis, category breakdown, allocation performance, savings analysis, period comparison, calculated insights and CSV export.
- Task 09: Main Dashboard using real financial data, income/expense analytics, financial health, monthly comparison, recent activity and feature summaries, with Chart.js visualisations matching the approved template direction.

## 5. Task 09 — Main Dashboard: Approved and Implemented Design Direction

The user explicitly reviewed the original SavvyFi admin dashboard and likes several of its existing sections and chart designs. Task 09 has been implemented against these instructions; they remain the binding visual direction for any future dashboard change.

### A. Income and Expenses Analytics Chart

- Do not remove the original income and expenses analytics chart.
- Retain the exact chart type and visual chart implementation used by the original template.
- Transform its data, labels, context and supporting information to reflect Gabsweb CashFlow.
- It must be properly prepared for future backend integration.
- Use actual frontend financial data from the shared data layer.
- Preserve the original chart's visual quality and useful interactions.
- Do not replace it with a different chart simply because a new design is being introduced.

### B. Financial Health Section

- Retain the Financial Health section.
- Its content, metrics, presentation and supporting information may be redesigned to make it meaningful for Gabsweb CashFlow.
- It must use legitimate financial calculations rather than generic or fabricated financial scores.
- Preserve the section's usefulness and visual identity while making it genuinely relevant to our application.

### C. Monthly Comparison

- Retain the Monthly Comparison section.
- Adapt its labels, metrics, chart details and supporting context to our actual financial tracking.
- Use real monthly data.
- Preserve the useful original chart design.

### D. Overall Dashboard Transformation

- The Main Dashboard must be a genuine transformation, not a simple text replacement.
- Do not delete everything and build an unrelated dashboard.
- Preserve useful original template sections, particularly the three sections above.
- Other sections may be redesigned, replaced or removed where they do not fit our application.
- Follow the visual direction established by Tasks 02–08.
- The final dashboard must feel as though it was originally designed for Gabsweb CashFlow.
- Integrate all relevant completed application features and previously agreed dashboard requirements.
- Do not implement the dashboard during Task 08.

## 6. Approved Corrections and Lessons

### Task 03 — Search icon positioning

1. What was wrong: the history search icon was displaced because Lucide replaces `<i data-lucide="...">` with `<svg>`, while the CSS positioned only `.mf-search-field i`.
2. User request: place the search icon correctly inside the transaction history search field.
3. Approved implementation: style both `.mf-search-field i` and `.mf-search-field svg` with the same absolute positioning rules.
4. Future rule: when absolutely positioning Lucide icons, target the rendered `svg` as well as the source `i` element.
5. Affected files: `assets/css/finances.css`, any future page CSS using Lucide inside positioned wrappers.

### Task 03 — Mobile page actions

1. What was wrong: on small screens the secondary “Add account” action occupied only one of two grid columns while the primary action spanned the full width.
2. User-approved outcome: both page-header actions should occupy the full mobile width with the primary action first.
3. Future rule: page-header action groups must stack intentionally on narrow screens, not leave orphaned half-width controls.
4. Affected files: `assets/css/finances.css` and future page-specific styles.

### Task 03 — Shell balance and notifications

1. What was wrong: the sidebar displayed hard-coded template balances and the header showed fake crypto notifications.
2. Approved implementation: the My Finances sidebar total/net-flow reflects the shared data layer; fake crypto notifications were replaced by a truthful empty state.
3. Future rule: do not leave fabricated financial or notification content visible on transformed pages.
4. Affected files: `transaction.html`, `assets/js/transaction.js`.

### Task 04 — Allocation plans and linked expenses

1. What was wrong: the template Budget page showed fabricated USD budget cards and used browser confirmation dialogs.
2. Approved implementation: the page was rebuilt around real allocation plans from `window.GabswebCashFlowData`; plans never change account balances or create expenses, and actual spending comes only from explicitly linked expense records.
3. Delete/cancel rule: an allocation with linked expenses cannot be deleted. Deleting is hidden in that case; cancelling keeps the record and linked expenses for history while setting `status` to `cancelled`, which excludes it from totals.
4. Unlinking rule: unlink with `updateTransaction(id, { allocationId: null })`. `undefined` cannot be used because the data layer's JSON clone drops undefined properties.
5. Month behaviour: the selected financial month defaults to the current month, the month selector and clickable history both change months, and months without income show truthful zero values.
6. Data-layer limitation: `getAllocationActualSpending` counts every linked expense regardless of the expense date. The page documents this in context and does not alter the central calculation. Link only same-month expenses manually until the shared layer supports month-scoped actual spending.
7. My Finances gap: My Finances has no allocation picker when recording an expense, so linking and unlinking happen in the allocation details modal through `updateTransaction`.
8. Responsive rule: below 720px the history remaining metric is hidden to avoid clipped amounts; planned and actual remain visible, and the fixed mobile bottom navigation is preserved.
9. Affected files: `budgets.html`, `assets/css/budgets.css`, `assets/js/budgets.js`.

### Task 05 — Goals and savings-plan funding

1. What was wrong: the template Goals page used fabricated USD goal balances, fake stats, fake achievements, fake add-funds increments and browser dialogs.
2. Approved implementation: the page was rebuilt around real goal records from `window.GabswebCashFlowData`. A goal has no separate balance; its progress comes only from `getGoalProgress`, which reads the linked savings plan's contributions minus withdrawals.
3. Funding model: a goal without a savings plan shows a truthful “Funding not linked” state and no progress bar. Add Funds offers two supported paths: create a new savings plan and link it, or link an existing unlinked plan. Both paths then record a `createSavingsMovement({ type: "contribution" })`.
4. Savings-only rule: goal contributions do not create income, expenses or transactions and do not change account balances. The optional source account is stored on the savings movement for context only.
5. Duplicate prevention: the UI does not offer a savings plan already linked to another goal. The overview totals deduplicate active goals by `savingsPlanId` so the same plan balance is not counted twice.
6. Delete rule: deleting a goal does not delete its linked savings plan or savings movements. The confirmation states this explicitly. A savings plan referenced by a goal or movement remains protected by the shared data layer.
7. Analysis rule: the details modal shows real target, saved and remaining values; actual contribution/withdrawal history; and a chart built from movement dates only. “On track”, “Behind schedule”, “Overdue” and “Target reached” are shown only when progress and dates support the assessment. Unlinked goals are never given a fabricated assessment.
8. Milestones rule: the former fake achievements card was replaced by “Goal milestones & upcoming deadlines” with approaching deadlines, reached targets and goals needing attention, all derived from stored goals and savings progress.
9. Icon correction: the “Saved toward goals” overview card and the Savings goal-category icon use `coins`, not `piggy-bank`. Avoid animal imagery for financial indicators.
10. Note alignment correction: the overview note icon was separated from its text by right-aligned text inside a wide flex container. The note text is now wrapped in its own span and aligned next to the icon at every breakpoint.
11. Responsive rule: goal cards, forms, details, charts and milestone columns reflow without horizontal overflow; the fixed mobile bottom navigation keeps a tested gap above the final content at 390px through 1024px.
12. Affected files: `goals.html`, `assets/css/goals.css`, `assets/js/goals.js`.

### Task 06 — Savings plans and movements

1. What was wrong: the template Savings page used fabricated USD missions, badges, leaderboards, challenges and rewards. It was replaced with a real Savings page using only `window.GabswebCashFlowData`.
2. Accounting model: savings plans are amounts set aside inside existing accounts. Contributions and withdrawals change only the plan balance. They do not create income, expenses or transactions and do not change account balances.
3. Available balance: `getAvailableBalance()` remains the central calculation and already excludes savings. Total account balance is not reduced again and savings are not added to total wealth, so total balance is not double-counted.
4. Plan model: the page uses supported plan fields only (`name`, `purpose`, `targetAmount`, `status`, `notes`). Plans have no target date, category or priority field. The nearest linked goal deadline is shown in insights instead.
5. Goal link rule: a goal links to a plan through `goal.savingsPlanId`. The UI offers only unlinked goals and the goal already linked to the plan being edited. Saving a plan can unlink its previous goal and link the selected goal.
6. Plan CRUD rule: plans with movements or a linked goal cannot be deleted. Those plans offer Archive instead, which keeps their movements and goal link intact. Plans with no movements and no linked goal can be deleted after confirmation.
7. Movement rule: contributions and withdrawals are recorded through `createSavingsMovement`. Withdrawals are validated in the UI against the current plan balance. The optional source account is context only.
8. Status rule: an active plan becomes Completed when a contribution reaches its target. A completed plan reopens to Active when a withdrawal takes it below its target. Archived plans do not accept new movements from the UI.
9. Insights rule: the four insight cards use stored plans, movements and linked goal dates only. They show the most funded plan, closest plan to target, next linked goal deadline and this month's contributions.
10. Activity rule: the activity list reads stored movements only and supports search, type, plan, date range and amount/date sorting. The details modal chart is built from movement dates and cumulative plan balance.
11. Wording correction: use plain language such as “set aside” in savings copy instead of technical accounting terms.
12. Responsive rule: plan cards, filters, forms, details, charts and activity reflow without horizontal overflow, with a tested gap above the fixed mobile bottom navigation. Both themes use existing tokens.
13. Verification: 56 targeted Chrome checks passed across plan calculations, CRUD, goal links, withdrawal validation, activity filters, mobile layout, persistence and themes; no JavaScript page errors.
14. Affected files: `savings.html`, `assets/css/savings.css`, `assets/js/savings.js`.

### Task 07 — Work Schedule and confirmed shifts

1. What was wrong: there was no dedicated Work Schedule page, and the existing template contained no truthful schedule workspace. The page was built from the shared work-schedule records instead of re-labelling template cards.
2. Data source: all schedule records, rotation settings and the stored anchor come from `window.GabswebCashFlowData`. The page does not use a second storage key or a separate schedule database.
3. Confirmed schedule: Morning is `7:00 AM–1:00 PM`, Afternoon is `1:00 PM–7:00 PM`, Night is `7:00 PM–7:00 AM next day`, and the confirmed sequence is Morning → Afternoon → Night.
4. Joining arrangement: on first use, Nov 1–2, 2026 are seeded as confirmed Afternoon working days and Nov 3–4, 2026 as confirmed days off. Seeding runs only when no work records exist, guarded by `settings.preferences.workScheduleInitialized` so deleted records are not re-created.
5. Generation rule (superseded by Post-Task 09): automatic generation was intentionally off in Task 07. Post-Task 09 adds preview-and-confirm generation from the user-entered first five-day cycle; saving rotation settings still never creates or changes entries by itself.
6. Rotation fields: the page stores `workingDaysPerCycle`, `offDaysPerCycle`, `shiftSequence`, and page-level `shiftTimes` on the existing rotation object. The anchor keeps its date, shift type, start time and end time. This extends the stored rotation without changing the data-layer schema or creating a second store.
7. Entry model: entries use `date`, `shiftType`, `status`, `startTime`, `endTime`, `team` and `notes`. Day-off entries use `shiftType: "off"` and `status: "off"` with no working times. A date can have only one schedule entry; duplicate dates are rejected in the UI.
8. Supervisor rule: the work record has no supervisor field, so selected-date details show the supervisor saved in the shared work profile. No supervisor, team member or assignment is invented per record.
9. Calendar rule: month, week and list views all read confirmed records only. Selecting a date updates the details panel, navigation moves the visible period, Today returns to the current date, and the date jump opens the selected month. Unconfirmed dates are labelled honestly rather than assigned a guessed shift.
10. Overview and history rule: overview cards, working-day counts, next shift, next day off, and upcoming/previous history are calculated from saved records and today's date. No fabricated schedule activity appears in the header notifications.
11. Overnight rule: Night displays as `7:00 PM – 7:00 AM next day`; custom night times are also labelled next day when the end time is at or before the start time.
12. Responsive and theme rule: month cells, week cards, list rows, details, rotation forms and history reflow without horizontal overflow. Both themes use existing tokens, the fixed mobile bottom navigation keeps a tested gap above the final content, and no vertical left-side accent lines were added.
13. Verification: 65 targeted Chrome checks passed across seeding, confirmed joining dates, overview values, month/week/list views, selection, entry add/edit/delete, duplicate rejection, overnight times, rotation persistence, future-generation protection, themes, mobile layout, persistence and console cleanliness.
14. Mobile detail transition (superseded by Post-Task 10): at 900px and below, selecting a calendar day reveals the selected-date details card. Post-Task 10 changed the scroll target from top-aligned to viewport-centred with a header offset. Desktop keeps the side-by-side details panel without forcing a scroll, and reduced-motion preferences disable the animation.
15. Affected files: `work-schedule.html`, `assets/css/work-schedule.css`, `assets/js/work-schedule.js`, plus Work Schedule sidebar links in `transaction.html`, `budgets.html`, `goals.html`, `savings.html` and `settings.html`.

### Task 08 — Reports & Insights

1. What was wrong: the template Reports page contained fabricated analytics, fixed sample values and a browser `alert`. It was rebuilt as a period report workspace driven entirely by `window.GabswebCashFlowData`, with no second storage key and no duplicated financial engine.
2. Period rule: This Month reports the current month to today, Last Month reports the full previous calendar month, Last 3 Months covers the current month plus the two before it, This Year runs from January 1 to today, and Custom accepts any valid date range. Reversed custom dates are swapped; empty or invalid dates are flagged on the inputs and do not replace the active report.
3. Comparison rule: every report is compared with the immediately preceding period of equal length. Last Month compares with the month before; This Year compares with the same dates last year. The comparison label always states the actual previous date range.
4. Income and expense rule: overview totals, charts, category tables and comparison rows use real income and expense transactions only. Transfers preserve total wealth and are excluded from income, expense, net and category totals. Opening balances and allocations are never counted as income or expense.
5. Category rule: expense and income breakdowns aggregate real transactions in the selected period, show amount, share and previous-period change, and support focusing the doughnut on one expense category while keeping the total visible. Previous-only categories remain visible in the period-changes table.
6. Allocation rule: planned amounts come from active allocation plans; actual linked spending is limited to real expenses explicitly linked to an allocation and dated inside the reporting period. Unlinked expenses stay in total expenses and are reported separately. The table shows under-plan, near-plan and over-plan states truthfully.
7. Known limitation carried from Task 04: `getAllocationActualSpending` is not date-scoped. The Reports page therefore filters linked expenses by date itself and explains this in the allocation section instead of changing the shared layer.
8. Savings rule: savings contributions and withdrawals are not income or expenses. Period savings statistics use only movements inside the selected range, while plan cards show each plan's all-time saved progress and completion status. Goal funding remains derived from linked savings plans.
9. Insight rule: insights are generated only from the current report and stored records, including highest spending category and month, largest income source, over-plan allocations and savings progress. No generic or invented financial advice is shown.
10. Export rule: Export CSV downloads the selected period's transactions as a ledger with date, type, category, description, account, amount and allocation columns. Transfer rows are included and labelled `transfer` so the export stays auditable without mixing them into income or expense totals.
11. Chart and theme rule: three Chart.js visualisations (cashflow analysis, expense doughnut and period comparison) are destroyed and rebuilt on period changes without duplication. Charts re-render for dark/light theme changes, and every chart has a truthful empty state.
12. Responsive rule: overview cards, two-column panels, category and allocation tables stack without horizontal overflow; tables become labelled blocks on mobile; content keeps clearance above the fixed bottom navigation. Existing tokens and Inter typography are preserved, and no vertical left-side accent lines were added.
13. Verification: controlled temporary records confirmed month-to-date, last-month, three-month, year-to-date and custom ranges; income/expense/net math; transfer exclusion; linked and unlinked allocation spending; savings movements; comparison rows; category focus; CSV export; chart lifecycle through theme changes; invalid date handling; empty states; desktop and 390px mobile layouts; and zero console errors. Temporary records and the seed file were removed.
14. Task 09 was later implemented using the approved Main Dashboard direction in section 5.
15. Affected files: `insights.html`, `assets/css/insights.css`, `assets/js/insights.js`. `assets/js/index.js` was not modified.
16. Category focus correction: the expense-category focus control previously relied on a document-level change listener and rebuilt the whole page on every selection. It now updates the expense table and doughnut directly, so selecting All categories reliably restores every row and every doughnut segment. All categories is no longer grouped behind an Other categories slice. Verified with seven categories and no console errors.


### Post-Task 09 — Consolidated refinement

1. Work Schedule source rule: work records now carry `source: "manual" | "generated"`. `addWorkScheduleRecord` defaults to `manual`; validation accepts only those two values. Records without the field from earlier data are treated as manual, so no migration or data loss occurs. Editing any generated entry through the normal form saves it as manual.
2. First-cycle rule: the first complete cycle must be five consecutive confirmed dates containing three working days and two days off. `findFirstCycle` prefers a valid five-day run beginning at `rotation.anchor.date`; otherwise it uses the earliest valid five-day run in the selected month. If the intended first cycle starts after joining dates, the user sets the rotation anchor to that cycle's first date. No shift pattern is assumed.
3. Generation rule: generation is preview-first and never automatic. The suggestion card appears only when a valid first cycle exists and unfilled dates remain later in the selected month. It shows the detected cycle, shift sequence, target date count and any conflicts. Nothing is written until the user confirms in the preview modal.
4. Generation scope rule: generation starts at the detected cycle's first date and stops at the end of the selected month. Dates before the detected cycle, including the Nov 1–4, 2026 joining arrangement, are never rewritten, reclassified or silently converted.
5. Conflict rule: manual records that differ from the proposed pattern are preserved and listed as conflicts in the preview. Matching manual records are not duplicated. Generated records that differ from the proposed pattern become update actions. The user may proceed with the remaining generated dates while keeping every conflict.
6. Power-loss and duplicate rule: all generated dates are written through the shared data layer with `source: "generated"`. Re-running generation after completion is not offered because no unfilled dates remain; refreshing the page does not duplicate records.
7. Generation verification: Node logic checks passed for valid and invalid cycles, three-on/two-off patterns, repeated Night shifts, off days, joining-date preservation, conflict preservation, skip-if-complete, and leap February 2028 ending on February 29. A Chrome interaction test confirmed the suggestion card, 22-row preview, one preserved conflict, 21 generated entries, `Nov 10 = Night 19:00–07:00`, and the card disappearing afterwards.
8. Shared notification rule: all 14 pages now use `assets/css/notifications.css` and `assets/js/notifications.js` with the same `.app-notification` markup. The panel opens correctly, sits inside the viewport at 1440px, 768px and 390px, causes no horizontal scrolling, closes on outside click and Escape, and updates `aria-expanded`. Empty states contain no fake unread badges or crypto alerts. Do not reintroduce inline notification scripts or fabricated notification dots.
9. Chart standardisation rule: every built page chart uses Chart.js with the Main Dashboard visual standard: indigo `#6366f1`, 2.5px line border, gradient fill, `tension: 0.35`, CSS-token tooltip colours, compact currency axis and no unnecessary legend. Charts must update when records/filters change, re-render on theme change, destroy old instances before rebuilding, and show a truthful empty state inside the chart container.
10. Goal details chart rule: the Goal Details chart is now a Chart.js line chart built only from the linked savings plan's contribution and withdrawal movements. It no longer uses a fabricated SVG path. Opening the modal, changing linked records, closing the modal and changing theme do not leave duplicate chart instances.
11. Savings details chart rule: the plan details chart is now the same Chart.js standard and uses only stored movement dates and the cumulative plan balance. Empty movement history renders a clean empty chart state.
12. Legacy scope decision: the duplicate legacy Goals Manager page was removed during the global cleanup. `index.html` still contains a dormant legacy `#detailed-forecast-chart` canvas in an unreachable modal with no initialisation; it is not part of the dashboard chart set.
13. Verification rule: chart checks confirmed real goal points `[0, 20000, 35000, 30000]` and savings points `[20000, 35000, 30000]` from controlled temporary records, with the expected dates and no empty-state fallback. Temporary records and test HTML files were removed.
14. Affected files: `assets/js/cashflow-data.js`, `assets/js/work-schedule.js`, `work-schedule.html`, `assets/css/work-schedule.css`, `assets/css/notifications.css`, `assets/js/notifications.js`, all 14 shared-layout HTML pages, `assets/js/goals.js`, `goals.html`, `assets/css/goals.css`, `assets/js/savings.js`, `savings.html`, `assets/css/savings.css`, and this document. `assets/js/index.js` was not modified.

### Post-Task 09 — Icon and badge restoration

1. What was wrong: transformed pages had drifted away from the SavvyFi visual language. Several icon containers were flat pastel tiles, some were 30–40px where the template uses larger gradient containers, badge sizing and casing were inconsistent, and status treatments were mixed between soft and gradient styles.
2. User request: restore the original SavvyFi icon, icon-container and badge design language across the built pages without redesigning content, changing functionality or replacing Gabsweb CashFlow terminology, icons or navigation.
3. Approved icon rule: summary and stat icons use a 40px mobile / 48px desktop gradient container with 16px radius and a white 24px icon. Goal cards and savings plan cards use 48px mobile / 64px desktop gradient containers with a white 24–30px icon. Transaction lists use 56px desktop / 48px tablet / 40px mobile / 38px tiny containers with white 24 / 22 / 20 / 18px icons. Secondary activity, movement, shift and history rows use 40px gradient containers with white 20px icons. Icon buttons are 40px square with a 12px radius. Do not use flat pastel icon tiles, mixed icon sizes in the same list or arbitrary gradients outside the established tone palette.
4. Approved badge rule: use the original tiny badge scale of 8px, bold, uppercase and pill-like radius. Status badges use gradient backgrounds with white text: green for active/off, amber for paused/pending, violet for completed, and indigo for neutral active states; archived remains a soft neutral badge. Informational, priority and trend badges use soft tinted backgrounds with readable coloured text. Badges remain inside the card or row header and never use a vertical left accent stripe.
5. Responsive and theme rule: the same icon and badge language must hold at 1440px, 768px and 390px widths and in both light and dark themes. Larger containers must not create horizontal overflow or push row actions off-screen. Lucide source icons must be converted to visible SVGs before reporting completion.
6. Scope rule: the duplicate legacy Goals Manager page was removed. `index.html` still contains the dormant unreachable `#detailed-forecast-chart` canvas in `#forecast-modal`; no JavaScript initialises it.
7. Verification rule: controlled temporary records populated dashboard, finance, budget, goal, savings, insight, work schedule and settings states. Chrome checks at 1440px, 768px and 390px in both themes confirmed the expected container sizes, gradient backgrounds, white icon colours, badge casing and no horizontal overflow. All eight built pages loaded with zero console errors and no unconverted visible Lucide source icons; temporary records and test copies were removed.
8. Affected files: `index.html`, `assets/css/dashboard.css`, `assets/css/finances.css`, `assets/css/budgets.css`, `assets/css/goals.css`, `assets/css/savings.css`, `assets/css/insights.css`, `assets/css/work-schedule.css`, `assets/css/settings.css`, `assets/css/notifications.css` and this document. `assets/js/index.js` was not modified.

### Global project cleanup — approved structure

- The canonical application pages are `index.html`, `transaction.html`, `budgets.html`, `savings.html`, `goals.html`, `work-schedule.html`, `insights.html` and `settings.html`.
- `login.html` and `register.html` are protected authentication pages and must remain untouched unless separately requested.
- Every retained application page uses the same direct-link sidebar: Dashboard, My Finances, Budget & Money Allocation, Savings, Goals & Planned Purchases, Work Schedule, Reports & Insights and Settings. Template dropdowns, duplicate destinations and unrelated Community, Messages, My Cards, Support and duplicate Goals Manager entries are not part of the application shell.
- The official page filenames are `transaction.html` and `savings.html`; links must use these canonical names.
- Confirmed orphan template pages and page-only scripts were removed only after project-wide reference checks. Assets still used by retained application pages were preserved.
- Profile-image preparation rule: Settings persists the selected image through the shared data layer's `preferences.profileImage` value. The sidebar and top navigation must read that shared value, use the existing `emma.jpg` fallback when no image is saved, and respond to the `gabsweb:profile-image-updated` event after a frontend save. A future Django integration should replace the initial shared value with the authenticated user's served image URL without changing the navigation markup.
- Settings profile-card rule: the personal profile image card remains the same width and visual treatment but uses a taller vertical rectangle layout, with the image, profile label and identity stacked as one centered block. The image scales down responsively without causing horizontal overflow.
- Desktop Settings profile-card refinement: the personal profile card is capped at 460px on large screens so its larger left-aligned image and adjacent identity text fit compactly without crowding. The detailed profile card below retains the full content-column width.
- Desktop Settings card arrangement: the profile hero and profile snapshot share the first row in two columns, while the profile details card or edit form spans the full content width below them. This arrangement applies only from 768px upward; smaller screens remain stacked.

### Post-Task 10 — Interaction fixes and remaining badge cleanup

1. Schedule selection rule: at 900px and below, clicking a calendar day still reveals the selected-date details, but the page now calculates a viewport-centred scroll position with the sticky-header offset instead of aligning the panel to the top. Panels taller than the available viewport align below the header, and reduced-motion preferences still disable smooth scrolling.
2. Goal chart rule: the Goal Details chart now renders after the modal is visible. `renderProgressChart` also accepts a single progress point, so a goal created and funded on the same date no longer falls back to an invisible chart. The modal re-renders the chart after opening to avoid hidden-canvas sizing.
3. Stat badge rule: every `*-stat-badge` / overview tag now uses the gradient badge language with white 8px uppercase text. Tone variants map to the supporting icon: green income, red expense, amber warning, violet planned, indigo transfer. The Goals “In progress” badge is green. This covers Finances, Budgets, Goals, Savings, Insights and Work Schedule overview cards.
4. Remaining icon cleanup: converted the final visible soft icon tiles to the established gradient containers, including settings profile snapshot, Insights insight cards, Work Schedule joining note and miniature Finance transaction rows. Do not reintroduce flat pastel tiles in these locations.
5. Remaining badge cleanup: Insights savings-plan status pills, Work Schedule rotation status and legacy shared goal status badges now use gradient status treatments. Work Schedule rotation status is slate for off, indigo for ready and green for complete. Added the missing orange gradient for the legacy article “Featured/Crypto/Author” badges.
6. Planner notes rule: saved daily notes and remarks default to read-only view mode. Each section exposes a low-emphasis text Edit/Add control; clicking it reveals the textarea and Save action, and a successful save returns the section to view mode. Switching planner dates exits edit mode and loads that date's saved text. Empty view states stay explicit.
7. Verification rule: 16 Chrome runs (eight built pages x dark/light) at 1440px, 768px and 390px confirmed no horizontal overflow, broken SVGs, unconverted visible Lucide icons or console errors. Additional interaction checks confirmed the schedule panel centre offset is 0, the single-point goal chart renders with the correct label/value, and planner notes transition view → edit → view after saving.
8. Scope note: legacy pages were not redesigned. Only shared legacy badge/status styling corrections were applied; retained application pages remain outside the full Task 01–09 rebuild scope where noted.
9. Affected files: `index.html`, `assets/js/dashboard.js`, `assets/css/dashboard.css`, `assets/js/work-schedule.js`, `assets/css/work-schedule.css`, `assets/js/goals.js`, `goals.html`, `budgets.html`, `transaction.html`, `savings.html`, `work-schedule.html`, `settings.html`, `assets/css/goals.css`, `assets/css/budgets.css`, `assets/css/finances.css`, `assets/css/savings.css`, `assets/css/insights.css`, `assets/css/work-schedule.css`, `assets/css/settings.css`, `assets/css/index.css`, and this document.

### Post-Task 11 — Dashboard privacy and chart clarity

1. Goal Details movement history uses a grouped bar chart for contributions and withdrawals, with the existing Chart.js theme palette and tooltips. This is preferred over a single cumulative line when users need to understand what activity changed the goal balance.
2. The dashboard Total balance card exposes an eye toggle. Hiding balances applies a blur treatment to dashboard monetary values and the sidebar balance while leaving labels, badges and navigation readable; toggling the same control restores values.
3. Dashboard metric badges and icon containers use the established gradient badge language. Stat badges have consistent spacing, uppercase text and tone-aligned colours, while goal priority pills use the same gradient treatment for high, medium and low priorities.
4. Affected files: `index.html`, `assets/js/dashboard.js`, `assets/css/dashboard.css`, `assets/js/goals.js`, `assets/css/goals.css`, and this document.

### Post-Task 12 — Brand logo assets

1. The supplied `assets/images/gabsweb-cashflow-logo.png` is the canonical dashboard mark. Shared page branding uses it inside the existing gradient logo container.
2. `assets/images/fav.png` is generated from the same mark with transparent empty margins removed and a compact purple treatment for favicon visibility.
3. The obsolete `assets/images/logo.png` asset was removed after all HTML references were migrated.
4. Affected files: shared HTML page shells, `assets/images/gabsweb-cashflow-logo.png`, `assets/images/fav.png`, `assets/css/index.css`, and this document.
5. The favicon mark fills the available 40px canvas more effectively, and the main logo uses reduced internal padding so the white mark is larger inside its gradient container without changing the container dimensions.

### Post-Task 13 — Global navigation refinement

1. All pages with an application header use the sidebar's existing `assets/images/profiles/emma.jpg` identity in a shared top-right profile button. Its menu links to `settings.html`, and logout removes the existing `auth` storage entry before routing to `login.html`.
2. Mobile bottom navigation contains exactly five destinations: Dashboard (`index.html`), My Finances (`transaction.html`), Budget (`budgets.html`), Savings (`savings.html`), and Goals (`goals.html`). Active state is derived from the current filename, so direct loads and refreshes remain correct; unrelated pages show no active destination.
3. The shared navigation is implemented in `assets/js/global-navigation.js` and shared application styles in `assets/css/index.css`. The script safely no-ops on authentication pages that do not have application navigation.
4. Profile menus close on repeat click, outside click, or Escape. The profile button and menu use accessible labels and menu roles, and the bottom navigation preserves content spacing on narrow screens.
5. Affected files: all application HTML shells, `assets/js/global-navigation.js`, `assets/css/index.css`, and this document.
6. Bottom navigation items use a vertical layout with the Lucide icon above the destination label, matching the original template's mobile navigation hierarchy.
7. Savings uses the `coins` Lucide icon, and each bottom-navigation item flexes evenly with clipped labels to prevent wrapping or horizontal overflow on narrow screens.
8. Support is not included in profile menus. The standalone sidebar Support destination remains available for direct navigation, while both sidebar and top navigation profile menus contain only Profile and Logout.

## 7. Task Workflow

1. Read this document and inspect the target page, related scripts, shared CSS and data-layer APIs before editing.
2. Identify what is functional, what is placeholder and what must be restructured.
3. Implement using the shared data layer and existing interaction patterns.
4. Test calculations, CRUD, validation, persistence, responsive layouts, both themes and console cleanliness with controlled temporary records.
5. Remove only temporary test records created during verification.
6. Update this document with new decisions, corrections, rejected patterns and limitations before reporting completion.
