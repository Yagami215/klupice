# Klupice Online 🇭🇷 🛋️

**Klupice Online** je moderna web aplikacija za mapiranje i dijeljenje najljepših klupica za odmor diljem Hrvatske. 

Projekt je prilagođen za **100% besplatan trajni hosting na GitHub Pages** uz **Supabase** bazu podataka i pohranu fotografija u oblaku.

---

## ✨ Značajke

- 🗺️ **Interaktivna karta Hrvatske (Leaflet):**
  - **Ulica (OpenStreetMap):** Besplatna detaljna karta bez API ključeva.
  - **Satelit (Esri):** Satelitske snimke visoke rezolucije s ograničenjem zuma (bez "Map data not yet available").
  - **Reljef (OpenTopoMap):** Topografska karta s izohipsama i reljefom bez sivog ekrana.
  - Automatsko prilagođavanje zuma i grupiranje (clustering) za brzo učitavanje.
  - Brzi skok na gradove: Zagreb, Split, Rijeka, Zadar, Osijek, Dubrovnik, Opatija, Rovinj...

- 📍 **Unos novih klupica:**
  - Kliknite na kartu ili iskoristite tipku *"Moja lokacija"* (GPS).
  - Automatsko prepoznavanje grada/mjesta (obrnuto geokodiranje).
  - Višestruki upload fotografija uz **automatsku klijentsku kompresiju slika na Canvasu** (fotografije od 10MB s mobitela automatski se smanjuju na ~250KB prije slanja, za munjevit upload).
  - Oznake: Hladovina, Pogled na more, Lijep pogled, Kanta za smeće, Noćna rasvjeta, Pametna klupa...

- 👥 **Zajednica u stvarnom vremenu:**
  - **Realtime sinkronizacija:** Čim netko doda klupicu ili je lajka, ona se odmah pojavljuje svima na karti.
  - Lajkanje (❤️) i komentiranje (💬).
  - *"Navigiraj"* jednim klikom otvara Google Maps s točnim GPS koordinatama.

---

## 🚀 Kako postaviti projekt na GitHub Pages (3 koraka)

### 1. Korak: Postavljanje besplatne Supabase baze (2 minute)
1. Registrirajte se na [supabase.com](https://supabase.com) (besplatno).
2. Kreirajte novi projekt (npr. `klupice`).
3. U lijevom izborniku kliknite na **SQL Editor**, kliknite na **New query**.
4. Kopirajte cijeli sadržaj datoteke `supabase_schema.sql`, zalijepite ga i kliknite **Run**. (Ovo će automatski kreirati tablice, storage bucket za slike i 10 početnih klupica u Hrvatskoj).
5. U lijevom izborniku idite na **Project Settings** -> **API** i kopirajte:
   - **Project URL**
   - **anon public API key**

### 2. Korak: Unos podataka u projekt
Otvorite datoteku `js/config.js` i upišite:
```javascript
const SUPABASE_CONFIG = {
  url: 'https://vaš-projekt.supabase.co',
  anonKey: 'vaš-anon-public-ključ',
  storageBucket: 'bench-photos'
};
```
*(Alternativno, podatke možete unijeti i izravno kroz web sučelje klikom na oznaku "Poveži Supabase" na vrhu stranice).*

### 3. Korak: Objava na GitHub Pages
1. Inicijalizirajte Git i gurnite projekt na svoj GitHub repozitorij:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Klupice Online"
   git branch -M main
   git remote add origin https://github.com/TVOJ-USERNAME/klupice.git
   git push -u origin main
   ```
2. Na GitHubu otvorite svoj repozitorij -> kliknite na **Settings** -> **Pages**.
3. Pod **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main** / folder: **/ (root)**
   - Kliknite **Save**.
4. Za 1-2 minute vaša stranica je uživo na adresi:
   👉 **`https://TVOJ-USERNAME.github.io/klupice/`**

---

## 💻 Lokalno testiranje na računalu

Dvokliknite na `run.bat` ili u terminalu pokrenite:
```powershell
py -m http.server 8000
```
Otvorite u pregledniku: **http://localhost:8000**
