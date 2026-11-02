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
    ip_address TEXT, -- MD5 hash IP adrese za limit unosa anonimnih korisnika
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ako tablica benches već postoji od ranije, osiguraj stupac ip_address:
ALTER TABLE public.benches ADD COLUMN IF NOT EXISTS ip_address TEXT;

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
CREATE INDEX IF NOT EXISTS idx_benches_ip ON public.benches(ip_address);
CREATE INDEX IF NOT EXISTS idx_bench_photos_bench ON public.bench_photos(bench_id);
CREATE INDEX IF NOT EXISTS idx_bench_comments_bench ON public.bench_comments(bench_id);
CREATE INDEX IF NOT EXISTS idx_bench_comments_user_id ON public.bench_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles(lower(username));

-- ====================================================================
-- SIGURNOSNA OGRANIČENJA: Max 500 klupica po računu, Max 250 po IP adresi (anonimno)
-- ====================================================================
CREATE OR REPLACE FUNCTION public.check_bench_insert_limits()
RETURNS TRIGGER AS $$
DECLARE
    v_ip TEXT;
    v_ip_hash TEXT;
    v_count INTEGER;
BEGIN
    -- 1. Ako je korisnik registriran (ima user_id) -> limit 500
    IF NEW.user_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_count
        FROM public.benches
        WHERE user_id = NEW.user_id;

        IF v_count >= 500 THEN
            RAISE EXCEPTION 'Dosegli ste maksimalni limit od 500 klupica po korisničkom računu.';
        END IF;
    ELSE
        -- 2. Ako je korisnik anoniman -> dohvati IP iz Supabase / Cloudflare zaglavlja ili polja
        BEGIN
            v_ip := current_setting('request.headers', true)::json->>'cf-connecting-ip';
            IF v_ip IS NULL OR v_ip = '' THEN
                v_ip := split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_ip := NULL;
        END;

        IF v_ip IS NULL OR v_ip = '' THEN
            v_ip := NEW.ip_address;
        END IF;

        IF v_ip IS NOT NULL AND v_ip <> '' THEN
            -- Hashing IP adrese (MD5 + salt) radi zaštite privatnosti (GDPR-friendly)
            v_ip_hash := md5(trim(v_ip) || '_klupice_secure_salt_2026');
            NEW.ip_address := v_ip_hash;

            SELECT COUNT(*) INTO v_count
            FROM public.benches
            WHERE ip_address = v_ip_hash AND user_id IS NULL;

            IF v_count >= 250 THEN
                RAISE EXCEPTION 'Dosegnut je limit od 250 klupica za anonimne unose s ove IP adrese. Registrirajte se za veći limit (do 500 klupica).';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_bench_limits ON public.benches;
CREATE TRIGGER trg_check_bench_limits
    BEFORE INSERT ON public.benches
    FOR EACH ROW
    EXECUTE FUNCTION public.check_bench_insert_limits();

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

-- Sigurno ažuriranje: samo vlasnik može uređivati svoju klupicu (lajkanje ide preko funkcije like_bench)
CREATE POLICY "Vlasnik može uređivati svoju klupicu" 
ON public.benches FOR UPDATE USING (auth.uid() = user_id);

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

-- Politike za tablicu profiles (zaštita privatnosti korisnika: korisnik vidi samo svoj profil)
CREATE POLICY "Korisnik može čitati svoj profil" 
ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Korisnik može uređivati svoj profil" 
ON public.profiles FOR ALL USING (auth.uid() = id);

-- ====================================================================
-- SIGURNE FUNKCIJE (RPC)
-- ====================================================================

-- 1. Sigurna funkcija za lajkanje klupice (onemogućuje neovlašteno mijenjanje koordinata/naziva)
CREATE OR REPLACE FUNCTION public.like_bench(p_bench_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
    v_likes INTEGER;
BEGIN
    UPDATE public.benches
    SET likes = COALESCE(likes, 0) + 1
    WHERE id = p_bench_id
    RETURNING likes INTO v_likes;

    RETURN v_likes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.like_bench(BIGINT) TO anon, authenticated;

-- 2. Sigurna funkcija za dohvat e-maila pri prijavi putem korisničkog imena (štiti sve e-mailove od javnog skrapiranja)
CREATE OR REPLACE FUNCTION public.get_email_for_username(p_username TEXT)
RETURNS TEXT AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT email INTO v_email
    FROM public.profiles
    WHERE lower(username) = lower(trim(p_username))
    LIMIT 1;

    RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_email_for_username(TEXT) TO anon, authenticated;

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

-- Ograničenja bucketa: isključivo slike (jpeg, png, webp) i maksimalno 3 MB po datoteci
UPDATE storage.buckets
SET public = true,
    file_size_limit = 3145728,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'bench-photos';

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
