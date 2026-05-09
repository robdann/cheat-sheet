import json
import os
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

# DATA_DIR can be overridden via env var — use a Railway Volume mounted at e.g. /data
_data_dir = Path(os.environ.get("DATA_DIR", Path(__file__).parent))
DATA_FILE = _data_dir / "songs.json"
FRONTEND = Path(__file__).parent.parent / "frontend"

app = FastAPI()


class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

app.add_middleware(NoCacheMiddleware)


@app.get("/api/songs")
def get_songs():
    if not DATA_FILE.exists():
        return JSONResponse([])
    return JSONResponse(json.loads(DATA_FILE.read_text()))


@app.post("/api/songs")
async def save_songs(request: Request):
    body = await request.body()
    try:
        songs = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    DATA_FILE.write_text(json.dumps(songs, indent=2))
    return JSONResponse({"ok": True})


app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
