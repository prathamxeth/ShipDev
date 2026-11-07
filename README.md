# ShipDev

A human-supervised multi-agent engineering workflow powered by Switch.

## Team

- Pratham — Frontend and integration
- Sumit — Switch and multi-agent orchestration
- Ayush — Backend, persistence and verification

## Architecture

- Frontend: Next.js + TypeScript
- Backend: Python + FastAPI
- Collaboration: Switch
- Persistence: SQLite
- Voice workflow: Wispr Flow

## Development & Integration Guides

- **Backend Architecture & Setup:** [docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md)
- **Frontend Contract (Pratham):** [docs/API_CONTRACT_FRONTEND.md](docs/API_CONTRACT_FRONTEND.md)
- **Switch Multi-Agent Integration (Sumit):** [docs/SWITCH_INTEGRATION.md](docs/SWITCH_INTEGRATION.md)
- **OpenAPI 3.1.0 Specification:** [backend/openapi.json](backend/openapi.json)

### Running Backend Tests
```powershell
cd backend
.venv\Scripts\pytest.exe -v
```
