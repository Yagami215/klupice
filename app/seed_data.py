import os
import sys
import json
import requests
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from app.database import get_connection, create_bench, add_photo, add_comment

SEED_BENCHES = []

def create_fallback_image(title, city, filename, thumb_filename):
    """Creates a stylized placeholder bench image if offline."""
    img = Image.new('RGB', (800, 500), color=(34, 76, 56)) # Forest green background
    draw = ImageDraw.Draw(img)
    
    # Draw simple bench illustration
    # Bench seat
    draw.rounded_rectangle([150, 240, 650, 265], radius=6, fill=(193, 154, 107), outline=(139, 90, 43), width=3)
    # Bench backrest slats
    draw.rounded_rectangle([150, 150, 650, 175], radius=6, fill=(210, 170, 120), outline=(139, 90, 43), width=2)
    draw.rounded_rectangle([150, 185, 650, 210], radius=6, fill=(210, 170, 120), outline=(139, 90, 43), width=2)
    # Bench legs (metal supports)
    draw.line([(220, 210), (220, 380)], fill=(45, 52, 54), width=10)
    draw.line([(580, 210), (580, 380)], fill=(45, 52, 54), width=10)
    draw.line([(180, 380), (260, 380)], fill=(45, 52, 54), width=8)
    draw.line([(540, 380), (620, 380)], fill=(45, 52, 54), width=8)
    
    # Ground shadow
    draw.ellipse([140, 370, 660, 410], fill=(20, 50, 35))
    
    # Save full
    img.save(filename, format="JPEG", quality=85)
    
    # Thumbnail
    thumb = img.copy()
    thumb.thumbnail((400, 250))
    thumb.save(thumb_filename, format="JPEG", quality=80)

def seed_database():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM benches")
    count = cursor.fetchone()[0]
    conn.close()

    if count > 0:
        print("Database already has data. Skipping seed.")
        return

    print("Seeding initial benches across Croatia...")
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    thumbs_dir = os.path.join(uploads_dir, "thumbs")
    os.makedirs(uploads_dir, exist_ok=True)
    os.makedirs(thumbs_dir, exist_ok=True)

    for i, bench_data in enumerate(SEED_BENCHES):
        bench_id = create_bench(
            title=bench_data["title"],
            description=bench_data["description"],
            lat=bench_data["latitude"],
            lng=bench_data["longitude"],
            city=bench_data["city"],
            condition=bench_data["condition"],
            tags=bench_data["tags"],
            author=bench_data["author"]
        )

        # Set initial likes
        conn = get_connection()
        conn.execute("UPDATE benches SET likes = ? WHERE id = ?", (bench_data.get("likes", 5), bench_id))
        conn.commit()
        conn.close()

        # Add comments
        for author, comment_text in bench_data.get("comments", []):
            add_comment(bench_id, author, comment_text)

        # Download / create image
        filename = f"bench_{bench_id}_1.jpg"
        file_path = os.path.join(uploads_dir, filename)
        thumb_filename = f"thumb_{bench_id}_1.jpg"
        thumb_path = os.path.join(thumbs_dir, thumb_filename)
        rel_url = f"/uploads/{filename}"
        rel_thumb_url = f"/uploads/thumbs/{thumb_filename}"

        img_downloaded = False
        if "img_url" in bench_data:
            try:
                resp = requests.get(bench_data["img_url"], timeout=6)
                if resp.status_code == 200:
                    img = Image.open(BytesIO(resp.content)).convert('RGB')
                    img.thumbnail((1200, 800))
                    img.save(file_path, format="JPEG", quality=85)

                    thumb = img.copy()
                    thumb.thumbnail((400, 260))
                    thumb.save(thumb_path, format="JPEG", quality=80)
                    img_downloaded = True
            except Exception as e:
                print(f"Failed to fetch image for {bench_data['title']}: {e}")

        if not img_downloaded:
            create_fallback_image(bench_data["title"], bench_data["city"], file_path, thumb_path)

        add_photo(bench_id, rel_url, rel_thumb_url)
        print(f"Added bench #{bench_id}: {bench_data['title']} ({bench_data['city']})")

    print("Seeding completed successfully!")

if __name__ == "__main__":
    from app.database import init_db
    init_db()
    seed_database()
