-- ====================================================================
-- KLUPICE ONLINE - SUPABASE BAZA PODATAKA & POHRANA
-- Kopirajte cijeli ovaj sadržaj u Supabase -> SQL Editor i kliknite RUN
-- ====================================================================

-- 1. Tablica za klupice
CREATE TABLE IF NOT EXISTS public.benches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT DEFAULT 'Klupica',
    description TEXT DEFAULT '',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    city TEXT DEFAULT 'Hrvatska',
    condition TEXT DEFAULT 'B', -- Tier ocjena: Peak, S, A, B, C, F
    tags TEXT[] DEFAULT '{}',
    author TEXT DEFAULT 'Anonimni šetač',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Poveznica s računom (NULL = anonimno)
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tablica za fotografije klupica
CREATE TABLE IF NOT EXISTS public.bench_photos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bench_id BIGINT NOT NULL REFERENCES public.benches(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tablica za komentare
CREATE TABLE IF NOT EXISTS public.bench_comments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bench_id BIGINT NOT NULL REFERENCES public.benches(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Poveznica s računom (NULL = anonimno)
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tablica za korisničke profile (omogućuje prijavu putem korisničkog imena ili e-maila)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksi za brže pretraživanje
CREATE INDEX IF NOT EXISTS idx_benches_coords ON public.benches(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_benches_city ON public.benches(city);
CREATE INDEX IF NOT EXISTS idx_benches_user_id ON public.benches(user_id);
CREATE INDEX IF NOT EXISTS idx_bench_photos_bench ON public.bench_photos(bench_id);
CREATE INDEX IF NOT EXISTS idx_bench_comments_bench ON public.bench_comments(bench_id);
CREATE INDEX IF NOT EXISTS idx_bench_comments_user_id ON public.bench_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles(lower(username));

-- ====================================================================
-- RLS (Row Level Security) - Omogućuje anonimno čitanje i pisanje
-- ====================================================================
ALTER TABLE public.benches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bench_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bench_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Politike za tablicu benches
CREATE POLICY "Svatko može pregledavati klupice" 
ON public.benches FOR SELECT USING (true);

CREATE POLICY "Svatko može dodati klupicu" 
ON public.benches FOR INSERT WITH CHECK (true);

CREATE POLICY "Svatko može lajkati klupicu" 
ON public.benches FOR UPDATE USING (true);

-- Politike za tablicu bench_photos
CREATE POLICY "Svatko može pregledavati slike" 
ON public.bench_photos FOR SELECT USING (true);

CREATE POLICY "Svatko može dodati sliku klupice" 
ON public.bench_photos FOR INSERT WITH CHECK (true);

-- Politike za tablicu bench_comments
CREATE POLICY "Svatko može čitati komentare" 
ON public.bench_comments FOR SELECT USING (true);

CREATE POLICY "Svatko može ostaviti komentar" 
ON public.bench_comments FOR INSERT WITH CHECK (true);

-- Politike za tablicu profiles (pretraga korisničkih imena pri prijavi)
CREATE POLICY "Svatko može čitati profile za prijavu" 
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Korisnik može uređivati svoj profil" 
ON public.profiles FOR ALL USING (auth.uid() = id);

-- ====================================================================
-- Automatski trigger za profile pri registraciji u Supabase Auth
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''), split_part(NEW.email, '@', 1)),
        NEW.email
    )
    ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username,
        email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sinkronizacija postojećih korisnika iz auth.users u profiles
INSERT INTO public.profiles (id, username, email)
SELECT 
    id, 
    COALESCE(NULLIF(TRIM(raw_user_meta_data->>'username'), ''), split_part(email, '@', 1)), 
    email
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- STORAGE BUCKET za slike (bench-photos)
-- ====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('bench-photos', 'bench-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Dozvola za javno čitanje slika iz bucketa
CREATE POLICY "Javni pristup slikama klupica"
ON storage.objects FOR SELECT
USING (bucket_id = 'bench-photos');

-- Dozvola za anonimni upload slika u bucket
CREATE POLICY "Svatko može uploadati slike klupica"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bench-photos');

-- ====================================================================
-- BAZA JE SPREMNA ZA KORISNIČKI UNOS KLUPICA
-- ====================================================================
