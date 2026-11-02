import os
import sys
import uuid
import json
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.database import (
    init_db,
    get_all_benches,
    get_bench_by_id,
    create_bench,
    add_photo,
    like_bench,
    add_comment,
    get_stats
)
from app.seed_data import seed_database

app = FastAPI(
    title="Klupice Online API",
    description="Interaktivna platforma za pronalaženje i unos klupica u Hrvatskoj",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
THUMBS_DIR = os.path.join(UPLOADS_DIR, "thumbs")
STATIC_DIR = os.path.join(BASE_DIR, "static")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(THUMBS_DIR, exist_ok=True)

# Mount static and uploads
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.on_event("startup")
def on_startup():
    init_db()
    seed_database()

def process_and_save_image(upload_file: UploadFile, bench_id: int):
    """Saves image, corrects orientation, creates optimized version and thumbnail."""
    ext = os.path.splitext(upload_file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".heic"]:
        ext = ".jpg"

    file_uuid = f"bench_{bench_id}_{uuid.uuid4().hex[:8]}"
    dest_filename = f"{file_uuid}{ext}"
    thumb_filename = f"thumb_{file_uuid}{ext}"

    dest_path = os.path.join(UPLOADS_DIR, dest_filename)
    thumb_path = os.path.join(THUMBS_DIR, thumb_filename)

    # Read image using Pillow
    try:
        img = Image.open(upload_file.file)
        # Handle EXIF orientation (smartphones often store rotation in EXIF)
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        # Convert RGBA to RGB for JPEG saving if needed
        if img.mode in ("RGBA", "P") and ext in [".jpg", ".jpeg"]:
            img = img.convert("RGB")

        # Save main optimized image (max 1600x1200)
        img_main = img.copy()
        img_main.thumbnail((1600, 1200), Image.Resampling.LANCZOS)
        img_main.save(dest_path, quality=85, optimize=True)

        # Save thumbnail (max 400x300)
        img_thumb = img.copy()
        img_thumb.thumbnail((400, 300), Image.Resampling.LANCZOS)
        img_thumb.save(thumb_path, quality=80, optimize=True)

        return f"/uploads/{dest_filename}", f"/uploads/thumbs/{thumb_filename}"
    except Exception as e:
        print(f"Error processing image {upload_file.filename}: {e}")
        return None, None

@app.get("/")
def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Klupice Online API is running. index.html is being prepared."}

@app.get("/api/benches")
def list_benches(
    search: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    condition: Optional[str] = Query(None)
):
    benches = get_all_benches(search=search, city=city, tag=tag, condition=condition)
    return benches

@app.get("/api/benches/{bench_id}")
def get_bench(bench_id: int):
    bench = get_bench_by_id(bench_id)
    if not bench:
        raise HTTPException(status_code=404, detail="Klupica nije pronađena.")
    return bench

@app.post("/api/benches")
async def add_bench_endpoint(
    title: Optional[str] = Form(""),
    description: Optional[str] = Form(""),
    latitude: float = Form(...),
    longitude: float = Form(...),
    city: Optional[str] = Form("Hrvatska"),
    condition: Optional[str] = Form("B"),
    tags: Optional[str] = Form("[]"),
    author: Optional[str] = Form("Anonimni šetač"),
    photos: List[UploadFile] = File(default=[])
):
    city_name = city.strip() if city and city.strip() else "Hrvatska"
    if not title or not title.strip():
        title = f"Klupica ({city_name})" if city_name != "Hrvatska" else "Klupica"

    # Parse tags JSON or comma-separated
    parsed_tags = []
    if tags:
        try:
            parsed_tags = json.loads(tags)
            if not isinstance(parsed_tags, list):
                parsed_tags = [str(tags)]
        except Exception:
            parsed_tags = [t.strip() for t in tags.split(",") if t.strip()]

    # Validate tier condition (Peak, S, A, B, C, F)
    cond = condition.strip().upper() if condition else "B"
    if cond in ["PEAK", "Z"]:
        condition = "Peak"
    elif cond in ["S", "A", "B", "C", "F"]:
        condition = cond
    else:
        condition = "B"

    bench_id = create_bench(
        title=title,
        description=description,
        lat=latitude,
        lng=longitude,
        city=city,
        condition=condition,
        tags=parsed_tags,
        author=author
    )

    # Process and save uploaded photos
    saved_photos = []
    if photos:
        for photo_file in photos:
            if photo_file.filename:
                rel_url, rel_thumb_url = process_and_save_image(photo_file, bench_id)
                if rel_url:
                    photo_id = add_photo(bench_id, rel_url, rel_thumb_url)
                    saved_photos.append({"id": photo_id, "url": rel_url, "thumb_url": rel_thumb_url})

    new_bench = get_bench_by_id(bench_id)
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=new_bench)

@app.post("/api/benches/{bench_id}/like")
def like_bench_endpoint(bench_id: int):
    bench = get_bench_by_id(bench_id)
    if not bench:
        raise HTTPException(status_code=404, detail="Klupica nije pronađena.")
    new_likes = like_bench(bench_id)
    return {"id": bench_id, "likes": new_likes}

@app.post("/api/benches/{bench_id}/comments")
def add_comment_endpoint(
    bench_id: int,
    author: str = Form("Anonimni šetač"),
    content: str = Form(...)
):
    bench = get_bench_by_id(bench_id)
    if not bench:
        raise HTTPException(status_code=404, detail="Klupica nije pronađena.")
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Komentar ne može biti prazan.")

    comment_id = add_comment(bench_id, author, content)
    updated_bench = get_bench_by_id(bench_id)
    return {"id": comment_id, "comments": updated_bench["comments"]}

@app.get("/api/stats")
def get_stats_endpoint():
    return get_stats()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
