---
title: Jobs Monitor
---

# Jobs Monitor

**Menu path:** Admin → Jobs Monitor  
**URL parameter:** `applicationName=jobs`

Jobs Monitor gives admins and developers one place to inspect background work in a Salesforce org. It covers scheduled jobs, Async Apex, the Apex Flex Queue, and Bulk API jobs.

---

## What You Can Monitor

| Area           | What It Shows                                                                    |
| -------------- | -------------------------------------------------------------------------------- |
| **Scheduled**  | `CronTrigger` jobs, cron expressions, next fire time, and trigger counts         |
| **Async Apex** | Future, Queueable, Batch, Scheduled Apex, and Apex test jobs from `AsyncApexJob` |
| **Flex Queue** | Queued Apex jobs and their Flex Queue positions                                  |
| **Bulk**       | Bulk API v2 ingest and query jobs, including processed and failed counts         |

Each tab supports search, status filtering, summary counts, manual refresh, and optional auto-refresh.

---

## Job Actions

- **Scheduled jobs** can be aborted from the Scheduled tab.
- **Bulk ingest jobs** can be selected to refresh details, abort in-flight work, preview failed results, and download success, failed, or unprocessed CSV files.
- **Apex test jobs** can be opened from the Async Apex tab to inspect test summary and method-level failures.

---

## Setup Shortcuts

The header includes shortcuts to the Salesforce Setup pages for Apex Jobs, Apex Flex Queue, Bulk Data Load Jobs, Scheduled Jobs, and Background Jobs.

---

## Related Tools

- [Data Import](./data-import) — create and monitor Bulk ingest jobs while importing CSV data
- [Anonymous Apex](./anonymous-apex) — run Apex that may create Async Apex jobs
- [Event Explorer](./event-explorer) — monitor event-driven workflows in real time
