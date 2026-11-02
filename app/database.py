import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "klupice.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS benches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        city TEXT,
        condition TEXT DEFAULT 'B',
        tags TEXT DEFAULT '[]',
        author TEXT DEFAULT 'Anonimni šetač',
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bench_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bench_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        thumb_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bench_id) REFERENCES benches(id) ON DELETE CASCADE
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bench_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bench_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bench_id) REFERENCES benches(id) ON DELETE CASCADE
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_benches_coords ON benches(latitude, longitude);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_benches_city ON benches(city);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bench_photos_bench_id ON bench_photos(bench_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bench_comments_bench_id ON bench_comments(bench_id);")

    conn.commit()
    conn.close()

def get_all_benches(search=None, city=None, tag=None, condition=None):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
    SELECT b.*,
           (SELECT json_group_array(json_object('id', p.id, 'url', p.file_path, 'thumb_url', p.thumb_path))
            FROM bench_photos p WHERE p.bench_id = b.id) AS photos_json,
           (SELECT COUNT(*) FROM bench_comments c WHERE c.bench_id = b.id) AS comments_count
    FROM benches b
    WHERE 1=1
    """
    params = []

    if search:
        query += " AND (b.title LIKE ? OR b.description LIKE ? OR b.city LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s])

    if city and city.lower() != 'sve':
        query += " AND LOWER(b.city) = LOWER(?)"
        params.append(city)

    if condition and condition.lower() != 'sve':
        query += " AND b.condition = ?"
        params.append(condition)

    query += " ORDER BY b.id DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        bench = dict(row)
        bench['tags'] = json.loads(bench['tags']) if bench['tags'] else []
        bench['photos'] = json.loads(bench['photos_json']) if bench['photos_json'] else []
        del bench['photos_json']
        
        # Filter by tag in python if requested
        if tag and tag.lower() != 'sve':
            if tag not in bench['tags']:
                continue

        results.append(bench)

    return results

def get_bench_by_id(bench_id):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM benches WHERE id = ?", (bench_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    bench = dict(row)
    bench['tags'] = json.loads(bench['tags']) if bench['tags'] else []

    cursor.execute("SELECT id, file_path as url, thumb_path as thumb_url, created_at FROM bench_photos WHERE bench_id = ? ORDER BY id ASC", (bench_id,))
    bench['photos'] = [dict(p) for p in cursor.fetchall()]

    cursor.execute("SELECT id, author, content, created_at FROM bench_comments WHERE bench_id = ? ORDER BY id DESC", (bench_id,))
    bench['comments'] = [dict(c) for c in cursor.fetchall()]

    conn.close()
    return bench

def create_bench(title, description, lat, lng, city=None, condition="B", tags=None, author=None):
    conn = get_connection()
    cursor = conn.cursor()

    tags_json = json.dumps(tags if tags else [])
    author = author.strip() if author and author.strip() else "Anonimni šetač"
    city = city.strip() if city and city.strip() else "Hrvatska"
    if not title or not title.strip():
        title = f"Klupica ({city})" if city != "Hrvatska" else "Klupica"
    else:
        title = title.strip()

    cursor.execute("""
    INSERT INTO benches (title, description, latitude, longitude, city, condition, tags, author)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (title.strip(), description.strip() if description else "", lat, lng, city, condition, tags_json, author))

    bench_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return bench_id

def add_photo(bench_id, file_path, thumb_path=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO bench_photos (bench_id, file_path, thumb_path)
    VALUES (?, ?, ?)
    """, (bench_id, file_path, thumb_path or file_path))
    photo_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return photo_id

def like_bench(bench_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE benches SET likes = likes + 1 WHERE id = ?", (bench_id,))
    conn.commit()
    cursor.execute("SELECT likes FROM benches WHERE id = ?", (bench_id,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else 0

def add_comment(bench_id, author, content):
    conn = get_connection()
    cursor = conn.cursor()
    author = author.strip() if author and author.strip() else "Anonimni šetač"
    cursor.execute("""
    INSERT INTO bench_comments (bench_id, author, content)
    VALUES (?, ?, ?)
    """, (bench_id, author, content.strip()))
    comment_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return comment_id

def get_stats():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM benches")
    total_benches = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM bench_photos")
    total_photos = cursor.fetchone()[0]

    cursor.execute("SELECT city, COUNT(*) as count FROM benches GROUP BY city ORDER BY count DESC LIMIT 5")
    top_cities = [dict(c) for c in cursor.fetchall()]

    conn.close()
    return {
        "total_benches": total_benches,
        "total_photos": total_photos,
        "top_cities": top_cities
    }
