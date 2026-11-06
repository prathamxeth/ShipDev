# ShipDev — Switch Multi-Agent Infrastructure

## Overview
ShipDev uses Switch to bring autonomous AI engineering agents into a shared Mattermost collaboration room with human developers. The core tenet of ShipDev is that **no task is ever completed simply because an AI claims it is fixed**.

## Agent Architecture
- **`@{team}-triager`**: Ingests bug reports and stack traces, isolates root cause, generates candidate patches, and hands off to the verifier. Strictly prohibited from declaring issues resolved.
- **`@{team}-verifier`**: Independently executes the test suite against proposed patches, rejects regressions back to the triager, and presents evidence to human engineers.
- **Human-in-the-Loop Gate**: A pull request is generated only when a human teammate explicitly replies `Approved`.

## Local Setup (Zero Slack Config)
1. Launch **Switch Console** on your machine (bundled with local Mattermost).
2. Ensure Docker Desktop is running.
3. In Switch Console, click **Import Template** and select `switch/template.yaml`.
4. Keep the default parameter (`team: "shipdev"`).
5. Switch will spin up the room `#shipdev-incident-room` with `@shipdev-triager` and `@shipdev-verifier`.

## Team Contracts
- **Backend (Ayush)**: Exposes test verification runner via `POST /api/verify` accepting `{ "repo_path": string, "patch": string }` returning `{ "status": "passed" | "failed", "logs": string }`.
- **Frontend (Pratham)**: Embeds the Mattermost room iframe into the ShipDev dashboard or subscribes to Switch room webhook events.

