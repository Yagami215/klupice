/**
 * Supabase Konfiguracija za Klupice Online
 * 
 * Ovdje možete upisati podatke iz vašeg Supabase projekta:
 * Supabase Dashboard -> Project Settings -> API
 */

const SUPABASE_CONFIG = {
  // 1. Project URL
  url: 'https://fwzzbtdyaikfyipfgzpy.supabase.co',

  // 2. Publishable anon public API key
  anonKey: 'sb_publishable_imMTh90JUyyQyBPX10g5MA_s1bgr1RE',

  // Naziv storage bucketa za fotografije (kreira se automatski putem supabase_schema.sql)
  storageBucket: 'bench-photos'
};

// Omogućuje spremanje i čitanje iz localStorage-a tako da korisnik može unijeti ključeve i kroz sučelje
function getEffectiveSupabaseConfig() {
  const localUrl = localStorage.getItem('klupice_supabase_url');
  const localKey = localStorage.getItem('klupice_supabase_key');

  const url = (localUrl && localUrl.trim()) ? localUrl.trim() : SUPABASE_CONFIG.url.trim();
  const anonKey = (localKey && localKey.trim()) ? localKey.trim() : SUPABASE_CONFIG.anonKey.trim();

  return {
    url,
    anonKey,
    storageBucket: SUPABASE_CONFIG.storageBucket,
    isConfigured: Boolean(url && anonKey && url.startsWith('http'))
  };
}
