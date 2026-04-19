---
title: Event Explorer
---

# Event Explorer

**Menu path:** Code → Event Explorer  
**URL parameter:** `applicationName=platformevent`

The Event Explorer lets you subscribe to Salesforce Platform Events and Change Data Capture (CDC) events in real time. Incoming event payloads are displayed as they arrive — no polling required.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **Event Explorer** in the left menu (under **Code**).
3. Select an event channel from the dropdown (e.g. a Platform Event like `My_Event__e`, or a CDC channel like `/data/AccountChangeEvent`).
4. Click **Subscribe** — Workbench opens a streaming API connection to the org.
5. Trigger events from your org (e.g. publish a Platform Event from Apex or a Flow).
6. Each arriving event appears in the event log panel below.

---

## Supported channels

| Channel type | Example channel |
| --- | --- |
| Platform Events | `/event/My_Event__e` |
| Change Data Capture | `/data/AccountChangeEvent` |
| Generic Streaming | `/topic/MyPushTopic` |
| Monitoring Events | `/event/LoginEventStream` |

Type a custom channel path directly in the channel input if the channel you need is not listed in the dropdown.

---

## Event log

Each received event is shown as a collapsible entry with:

- Timestamp of arrival
- Replay ID (used for resuming a subscription from a past position)
- Full event payload formatted as JSON

You can pause the log to freeze incoming events without dropping the subscription, and resume to continue capturing.

---

## Replay

Platform Events and CDC channels support replaying past events using a replay ID. Enter a specific replay ID in the **Replay From** field before subscribing to start from a past position in the event stream. Use `-1` for all retained events (up to 72 hours) and `-2` for new events only.

---

## Tips

- Use Event Explorer to debug event-driven Flows, Triggers, or integrations by observing the exact payload being published.
- Pair with [Anonymous Apex](./anonymous-apex) to publish test events on demand and verify the subscription captures them.
- Multiple subscriptions can run in parallel by opening additional Event Explorer tabs.

---

## Related tools

- [Anonymous Apex](./anonymous-apex) — publish Platform Events from Apex to test subscriptions
- [API Explorer](./api-explorer) — publish events via the REST API
