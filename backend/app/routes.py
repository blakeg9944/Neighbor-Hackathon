"""All /api endpoints (DESIGN_SPEC §6). Routes only handle HTTP input/output; logic lives in services/."""
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile

from .auth import get_user_id
from .schemas import (
    GeneratedPdf, Job, JobCreate, JobDetail, JobListItem, Layout, Ok, Profile, ProfileUpdate, Tile, TileCreate,
    TilesOut, TileUpdate,
)
from .services import bank_service, job_service, profile_service

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"ok": True}


# --- profile ----------------------------------------------------------------

@router.get("/me", response_model=Profile)
def get_me(user_id: str = Depends(get_user_id)):
    return profile_service.get_profile(user_id)


@router.put("/me", response_model=Profile)
def update_me(body: ProfileUpdate, user_id: str = Depends(get_user_id)):
    return profile_service.update_profile(user_id, body.model_dump(exclude_unset=True))


# --- resume bank (tiles) ----------------------------------------------------

@router.post("/resume/parse", response_model=TilesOut)
def parse_resume(
    background: BackgroundTasks,
    file: UploadFile | None = File(None),
    text: str | None = Form(None),
    user_id: str = Depends(get_user_id),
):
    tiles = bank_service.parse_resume(user_id, pdf_bytes=file.file.read() if file else None, text=text)
    background.add_task(bank_service.refresh_profile_embedding, user_id)
    return {"tiles": tiles}


@router.get("/tiles", response_model=list[Tile])
def list_tiles(user_id: str = Depends(get_user_id)):
    return bank_service.list_tiles(user_id)


@router.post("/tiles", response_model=Tile)
def create_tile(body: TileCreate, background: BackgroundTasks, user_id: str = Depends(get_user_id)):
    tile = bank_service.create_tile(user_id, body.category, text=body.text, data=body.data)
    background.add_task(bank_service.refresh_profile_embedding, user_id)
    return tile


@router.patch("/tiles/{tile_id}", response_model=Tile)
def update_tile(tile_id: str, body: TileUpdate, background: BackgroundTasks, user_id: str = Depends(get_user_id)):
    tile = bank_service.update_tile(user_id, tile_id, category=body.category, text=body.text, data=body.data)
    if body.text is not None or body.data is not None:
        background.add_task(bank_service.refresh_profile_embedding, user_id)
    return tile


@router.delete("/tiles/{tile_id}", response_model=Ok)
def delete_tile(tile_id: str, background: BackgroundTasks, user_id: str = Depends(get_user_id)):
    bank_service.delete_tile(user_id, tile_id)
    background.add_task(bank_service.refresh_profile_embedding, user_id)
    return {"ok": True}


# --- jobs -------------------------------------------------------------------

@router.post("/jobs", response_model=JobDetail)
def create_job(body: JobCreate, user_id: str = Depends(get_user_id)):
    return job_service.create_job(user_id, body.url, body.description)


@router.post("/url", response_model=JobDetail)
def create_job_from_url(body: JobCreate, user_id: str = Depends(get_user_id)):
    """Use the same authenticated tailoring flow for a URL supplied by the extension."""
    return job_service.create_job(user_id, body.url, body.description)


@router.get("/jobs", response_model=list[JobListItem])
def list_jobs(user_id: str = Depends(get_user_id)):
    return job_service.list_jobs(user_id)


@router.get("/jobs/recommended", response_model=list[Job])  # before /jobs/{job_id} so it isn't captured
def recommended_jobs(limit: int = 10, include_saved: bool = False, user_id: str = Depends(get_user_id)):
    return job_service.recommended_jobs(user_id, min(max(limit, 1), 50), include_saved)


@router.get("/jobs/{job_id}", response_model=JobDetail)
def get_job(job_id: str, user_id: str = Depends(get_user_id)):
    return job_service.get_job(user_id, job_id)


@router.post("/jobs/{job_id}/autoselect", response_model=JobDetail)
def autoselect(job_id: str, user_id: str = Depends(get_user_id)):
    return job_service.autoselect(user_id, job_id)


@router.put("/jobs/{job_id}/layout", response_model=Ok)
def save_layout(job_id: str, body: Layout, user_id: str = Depends(get_user_id)):
    job_service.save_layout(user_id, job_id, body.model_dump())
    return {"ok": True}


@router.post("/jobs/{job_id}/pdfs", response_model=GeneratedPdf)
def generate_pdf(job_id: str, body: Layout, user_id: str = Depends(get_user_id)):
    return job_service.generate_pdf(user_id, job_id, body.model_dump())


@router.delete("/jobs/{job_id}", response_model=Ok)
def delete_job(job_id: str, user_id: str = Depends(get_user_id)):
    job_service.delete_job(user_id, job_id)
    return {"ok": True}
