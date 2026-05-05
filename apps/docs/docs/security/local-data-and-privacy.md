---
title: Local Data and Privacy
---

# Local Data and Privacy

This section explains how Workbench handles local workspace data and network transfer behavior.

## Local retention by default for workspace files

- virtual workspace files used by the embedded workbench are stored in IndexedDB on your machine
- file operations performed through the virtual workspace remain local to your browser/app storage
- this design helps ensure your workspace content is retained locally
- Workbench Desktop stores desktop org metadata in Electron app storage and encrypts imported refresh-token material with OS-backed Electron safe storage

## No automatic raw workspace upload

- Workbench does not automatically transfer your full virtual file system contents to a central server as raw file dumps
- your local workspace state is intended to stay on your machine unless you explicitly export/share content

## When network traffic can happen

Network requests can still occur for explicit product features, for example:

- Salesforce API and org connectivity operations
- LLM provider calls when AI features are used
- optional external integrations you invoke directly
- desktop PMD installation checks GitHub release metadata and downloads the pinned PMD distribution when you start that installer flow

## Desktop automation

Workbench Desktop exposes a loopback-only automation API for the `workbench-desktop` CLI and agent integrations. Mutating automation calls require a per-install bearer token stored in the desktop user-data directory, and the API rejects requests from non-loopback hosts.

Desktop logs are written to Electron's logs directory as `main.log`. Use **Help → Open Logs Folder** from the desktop menu. Logs are redacted for common Salesforce token formats before being written, but you should still review log files before sharing them.

## Security guidance for users

- review prompts before submitting sensitive code/content to external AI models
- keep API keys and credentials in local environment/config storage only
- prefer SFDX auth URL file/stdin import for desktop org sharing so token material is not saved in shell history
- remove local browser/app storage when decommissioning a machine

## Related docs

- [IndexedDB Virtual File System](../storage/indexeddb-workspace)
- [Reporting Issues and Requests](../contributing/reporting-issues)
