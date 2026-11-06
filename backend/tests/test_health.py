import pytest
import httpx
from app.main import app


@pytest.mark.asyncio
async def test_health_check_returns_ok():
    """Verify that /health returns status 200 and expected payload."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "environment" in data
        assert "version" in data
        assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_nonexistent_route_returns_404():
    """Verify that undefined routes properly return 404 Not Found."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/nonexistent")
        assert response.status_code == 404

