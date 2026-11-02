/**
 * Supabase Data Layer & Image Compression for Klupice Online
 */

let supabaseClient = null;

// Initialize Supabase Client
function initSupabase() {
  const config = getEffectiveSupabaseConfig();
  if (config.isConfigured && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(config.url, config.anonKey);
      return true;
    } catch (e) {
      console.error('Greška pri inicijalizaciji Supabase klijenta:', e);
      supabaseClient = null;
      return false;
    }
  }
  return false;
}

// Client-side image compression using HTML5 Canvas (reduces 10MB phone photos to ~250KB)
async function compressImage(file, maxDimension = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas kompresija nije uspjela'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// Početno stanje: prazna lista (klupice unose korisnici)
const DEMO_BENCHES = [];

// In-memory array kada Supabase nije povezan
let localBenchesState = [];

// API WRAPPER
const BenchAPI = {
  // Check if real database is connected
  isLive: () => Boolean(supabaseClient),

  // Fetch all benches with filters
  async getBenches({ search, city, tags, tag, condition, uploaderType }) {
    // Normalise active tags list (supports multi-select tags array or single tag string)
    const activeTagsList = Array.isArray(tags) 
      ? tags 
      : (tag && tag !== 'sve' ? [tag] : []);

    // 1. IF AI FILTER IS SELECTED: Return from AI Baza
    if (uploaderType === 'ai') {
      const aiList = window.AI_BENCHES || [];
      return aiList.filter(b => {
        if (city && city !== 'sve' && b.city.toLowerCase() !== city.toLowerCase()) return false;
        if (condition && condition !== 'sve' && b.condition !== condition) return false;
        
        // Multi-select tags: bench must have ALL selected tags
        if (activeTagsList.length > 0) {
          const hasAllTags = activeTagsList.every(t => b.tags && b.tags.includes(t));
          if (!hasAllTags) return false;
        }

        if (search) {
          const s = search.toLowerCase();
          const matchTitle = b.title && b.title.toLowerCase().includes(s);
          const matchDesc = b.description && b.description.toLowerCase().includes(s);
          const matchCity = b.city && b.city.toLowerCase().includes(s);
          const matchAuthor = b.author && b.author.toLowerCase().includes(s);
          if (!matchTitle && !matchDesc && !matchCity && !matchAuthor) return false;
        }
        return true;
      });
    }

    // 2. COMMUNITY BENCHES (Demo mode fallback)
    if (!supabaseClient) {
      return localBenchesState.filter(b => {
        // Exclude AI benches from community 'sve' view
        if (b.is_ai) return false;

        if (city && city !== 'sve' && b.city.toLowerCase() !== city.toLowerCase()) return false;
        if (condition && condition !== 'sve' && b.condition !== condition) return false;

        // Multi-select tags: bench must have ALL selected tags
        if (activeTagsList.length > 0) {
          const hasAllTags = activeTagsList.every(t => b.tags && b.tags.includes(t));
          if (!hasAllTags) return false;
        }
        
        // Filter by uploader identity (verified / anonymous)
        if (uploaderType === 'verified') {
          const isVerified = (b.user_id !== null && b.user_id !== undefined) || 
                             (b.author && b.author.trim() !== '' && b.author.trim().toLowerCase() !== 'anonimni šetač');
          if (!isVerified) return false;
        } else if (uploaderType === 'anonymous') {
          const isAnon = (!b.user_id) && 
                         (!b.author || b.author.trim() === '' || b.author.trim().toLowerCase() === 'anonimni šetač');
          if (!isAnon) return false;
        }

        if (search) {
          const s = search.toLowerCase();
          const matchTitle = b.title && b.title.toLowerCase().includes(s);
          const matchDesc = b.description && b.description.toLowerCase().includes(s);
          const matchCity = b.city && b.city.toLowerCase().includes(s);
          const matchAuthor = b.author && b.author.toLowerCase().includes(s);
          if (!matchTitle && !matchDesc && !matchCity && !matchAuthor) return false;
        }
        return true;
      });
    }

    // 3. COMMUNITY BENCHES (Supabase database)
    try {
      let query = supabaseClient
        .from('benches')
        .select(`
          *,
          photos:bench_photos(id, url, created_at),
          comments:bench_comments(id, author, content, created_at)
        `)
        .order('id', { ascending: false });

      if (city && city !== 'sve') {
        query = query.ilike('city', city);
      }
      if (condition && condition !== 'sve') {
        query = query.eq('condition', condition);
      }
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,city.ilike.%${search}%,author.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = data || [];

      // Exclude AI benches from community 'sve' view
      results = results.filter(b => !b.is_ai);

      // Multi-select tags filter: bench must have ALL selected tags
      if (activeTagsList.length > 0) {
        results = results.filter(b => {
          if (!b.tags || !Array.isArray(b.tags)) return false;
          return activeTagsList.every(t => b.tags.includes(t));
        });
      }

      // Filter by uploader identity (verified / anonymous)
      if (uploaderType === 'verified') {
        results = results.filter(b => 
          (b.user_id !== null && b.user_id !== undefined) || 
          (b.author && b.author.trim() !== '' && b.author.trim().toLowerCase() !== 'anonimni šetač')
        );
      } else if (uploaderType === 'anonymous') {
        results = results.filter(b => 
          (!b.user_id) && 
          (!b.author || b.author.trim() === '' || b.author.trim().toLowerCase() === 'anonimni šetač')
        );
      }

      // Add comments_count
      results = results.map(b => ({
        ...b,
        comments_count: b.comments ? b.comments.length : 0
      }));

      return results;
    } catch (err) {
      console.error('Supabase query error:', err);
      throw err;
    }
  },

  // Get bench by ID
  async getBenchById(id) {
    if (typeof id === 'string' && id.startsWith('ai-')) {
      const aiBench = (window.AI_BENCHES || []).find(b => b.id === id);
      if (aiBench) return aiBench;
    }

    if (!supabaseClient) {
      return localBenchesState.find(b => b.id == id) || (window.AI_BENCHES || []).find(b => b.id == id) || null;
    }

    try {
      const { data, error } = await supabaseClient
        .from('benches')
        .select(`
          *,
          photos:bench_photos(id, url, created_at),
          comments:bench_comments(id, author, content, created_at)
        `)
        .eq('id', id)
        .single();

      if (error) {
        const aiBench = (window.AI_BENCHES || []).find(b => b.id == id);
        if (aiBench) return aiBench;
        throw error;
      }
      return data;
    } catch (err) {
      const aiBench = (window.AI_BENCHES || []).find(b => b.id == id);
      if (aiBench) return aiBench;
      throw err;
    }
  },

  // Create new bench with images (Title, Description, and Images are all optional)
  async createBench(benchData, imageFiles = []) {
    const rawTitle = benchData.title ? benchData.title.trim() : '';
    const city = benchData.city ? benchData.city.trim() : 'Hrvatska';
    const title = rawTitle || (city !== 'Hrvatska' ? `Klupica (${city})` : 'Klupica');
    const condition = benchData.condition || 'B';

    if (!supabaseClient) {
      // Demo mode fallback
      const newId = localBenchesState.length + 1;
      const demoPhotos = [];

      if (imageFiles && imageFiles.length > 0) {
        for (const file of imageFiles) {
          const url = URL.createObjectURL(file);
          demoPhotos.push({ url });
        }
      }

      const newBench = {
        id: newId,
        title: title,
        description: benchData.description ? benchData.description.trim() : '',
        latitude: parseFloat(benchData.latitude),
        longitude: parseFloat(benchData.longitude),
        city: city,
        condition: condition,
        tags: benchData.tags || [],
        author: benchData.author ? benchData.author.trim() : 'Anonimni šetač',
        user_id: benchData.userId || null,
        likes: 0,
        created_at: new Date().toISOString(),
        photos: demoPhotos,
        comments: []
      };

      localBenchesState.unshift(newBench);
      return newBench;
    }

    try {
      // 1. Insert bench record
      const insertRecord = {
        title: title,
        description: benchData.description ? benchData.description.trim() : '',
        latitude: parseFloat(benchData.latitude),
        longitude: parseFloat(benchData.longitude),
        city: city,
        condition: condition,
        tags: benchData.tags || [],
        author: benchData.author ? benchData.author.trim() : 'Anonimni šetač'
      };

      if (benchData.userId) {
        insertRecord.user_id = benchData.userId;
      }

      const { data: bench, error: benchErr } = await supabaseClient
        .from('benches')
        .insert(insertRecord)
        .select()
        .single();

      if (benchErr) throw benchErr;

      // 2. Compress and upload each photo to Supabase Storage (if any provided)
      const uploadedPhotos = [];
      const config = getEffectiveSupabaseConfig();

      if (imageFiles && imageFiles.length > 0) {
        for (const file of imageFiles) {
          try {
            const compressedBlob = await compressImage(file);
            const fileExt = 'jpg';
            const fileName = `${bench.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            const { error: uploadErr } = await supabaseClient
              .storage
              .from(config.storageBucket)
              .upload(fileName, compressedBlob, {
                contentType: 'image/jpeg',
                upsert: true
              });

            if (uploadErr) {
              console.error('Storage upload error:', uploadErr);
              continue;
            }

            // Get Public URL
            const { data: { publicUrl } } = supabaseClient
              .storage
              .from(config.storageBucket)
              .getPublicUrl(fileName);

            // Save photo reference in database
            const { data: photoRecord } = await supabaseClient
              .from('bench_photos')
              .insert({
                bench_id: bench.id,
                url: publicUrl
              })
              .select()
              .single();

            if (photoRecord) uploadedPhotos.push(photoRecord);
          } catch (imgErr) {
            console.error('Greška pri obradi slike:', imgErr);
          }
        }
      }

      bench.photos = uploadedPhotos;
      bench.comments = [];
      return bench;

    } catch (err) {
      console.error('Greška pri kreiranju klupice u Supabase:', err);
      throw err;
    }
  },

  // Like bench
  async likeBench(id, currentLikes) {
    if (typeof id === 'string' && id.startsWith('ai-')) {
      const b = (window.AI_BENCHES || []).find(bench => bench.id === id);
      if (b) b.likes = (b.likes || 0) + 1;
      return (b ? b.likes : (currentLikes + 1));
    }

    if (!supabaseClient) {
      const b = localBenchesState.find(bench => bench.id == id);
      if (b) b.likes = (b.likes || 0) + 1;
      return (b ? b.likes : (currentLikes + 1));
    }

    const newLikes = (currentLikes || 0) + 1;
    const { error } = await supabaseClient
      .from('benches')
      .update({ likes: newLikes })
      .eq('id', id);

    if (error) throw error;
    return newLikes;
  },

  // Add comment
  async addComment(benchId, author, content, userId = null) {
    if (typeof benchId === 'string' && benchId.startsWith('ai-')) {
      const b = (window.AI_BENCHES || []).find(bench => bench.id === benchId);
      const newComment = {
        id: Date.now(),
        author: author && author.trim() ? author.trim() : 'Anonimni šetač',
        content: content,
        user_id: userId,
        created_at: new Date().toISOString()
      };
      if (b) {
        b.comments = b.comments || [];
        b.comments.unshift(newComment);
        return b.comments;
      }
      return [newComment];
    }

    if (!supabaseClient) {
      const b = localBenchesState.find(bench => bench.id == benchId);
      const newComment = {
        author: author || 'Anonimni šetač',
        content: content,
        user_id: userId,
        created_at: new Date().toISOString()
      };
      if (b) {
        b.comments = b.comments || [];
        b.comments.unshift(newComment);
      }
      return b ? b.comments : [newComment];
    }

    const commentPayload = {
      bench_id: benchId,
      author: author ? author.trim() : 'Anonimni šetač',
      content: content.trim()
    };
    if (userId) {
      commentPayload.user_id = userId;
    }

    const { error: commentErr } = await supabaseClient
      .from('bench_comments')
      .insert(commentPayload);

    if (commentErr) throw commentErr;

    // Fetch updated comments
    const { data: comments, error } = await supabaseClient
      .from('bench_comments')
      .select('id, author, content, user_id, created_at')
      .eq('bench_id', benchId)
      .order('id', { ascending: false });

    if (error) throw error;
    return comments;
  },

  // Authentication: Sign Up
  async signUp(email, password, username) {
    const cleanEmail = email.trim();
    const cleanUsername = username ? username.trim() : cleanEmail.split('@')[0];

    if (!supabaseClient) {
      // Demo mode fallback with local account list
      const accounts = JSON.parse(localStorage.getItem('klupice_demo_accounts') || '[]');
      const existing = accounts.find(a => 
        a.email.toLowerCase() === cleanEmail.toLowerCase() || 
        (a.username && a.username.toLowerCase() === cleanUsername.toLowerCase())
      );
      if (existing) {
        throw new Error('Korisnik s ovim e-mailom ili korisničkim imenom već postoji.');
      }
      const mockUser = {
        id: 'demo-user-' + Date.now(),
        email: cleanEmail,
        user_metadata: { username: cleanUsername }
      };
      accounts.push({ id: mockUser.id, email: cleanEmail, username: cleanUsername, password: password });
      localStorage.setItem('klupice_demo_accounts', JSON.stringify(accounts));
      localStorage.setItem('klupice_demo_user', JSON.stringify(mockUser));
      return { user: mockUser, session: { user: mockUser } };
    }

    // 1. Check if username is already taken in public.profiles (if table exists)
    try {
      const { data: existingProfile } = await supabaseClient
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (existingProfile) {
        throw new Error('Korisničko ime je već zauzeto. Molimo odaberite drugo.');
      }
    } catch (e) {
      if (e.message && e.message.includes('već zauzeto')) throw e;
    }

    // 2. Perform Supabase Auth Sign Up
    const { data, error } = await supabaseClient.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: {
          username: cleanUsername
        }
      }
    });

    if (error) throw error;

    // 3. Upsert into public.profiles to guarantee immediate lookup
    if (data?.user) {
      try {
        await supabaseClient.from('profiles').upsert({
          id: data.user.id,
          username: cleanUsername,
          email: cleanEmail
        });
      } catch (profErr) {
        console.warn('Profile sync notice:', profErr);
      }
    }

    return data;
  },

  // Authentication: Sign In (Supports Email OR Username)
  async signIn(identifier, password) {
    const cleanInput = identifier.trim();
    const isEmail = cleanInput.includes('@');

    if (!supabaseClient) {
      // Demo mode fallback: match either username or email
      const accounts = JSON.parse(localStorage.getItem('klupice_demo_accounts') || '[]');
      let matched = accounts.find(a => 
        a.email.toLowerCase() === cleanInput.toLowerCase() || 
        (a.username && a.username.toLowerCase() === cleanInput.toLowerCase())
      );
      if (matched) {
        if (matched.password && matched.password !== password) {
          throw new Error('Pogrešna lozinka.');
        }
      } else {
        matched = {
          id: 'demo-user-1',
          email: isEmail ? cleanInput : `${cleanInput.toLowerCase()}@klupice.hr`,
          username: isEmail ? cleanInput.split('@')[0] : cleanInput
        };
      }
      const mockUser = {
        id: matched.id,
        email: matched.email,
        user_metadata: { username: matched.username }
      };
      localStorage.setItem('klupice_demo_user', JSON.stringify(mockUser));
      return { user: mockUser, session: { user: mockUser } };
    }

    let targetEmail = cleanInput;

    // If identifier is a username (no '@'), look up corresponding email from public.profiles
    if (!isEmail) {
      try {
        const { data: profile, error: profileErr } = await supabaseClient
          .from('profiles')
          .select('email')
          .ilike('username', cleanInput)
          .maybeSingle();

        if (profileErr) {
          console.warn('Greška pri dohvatu profila:', profileErr);
          throw new Error('Korisničko ime nije pronađeno. Pokušajte se prijaviti putem e-mail adrese.');
        }

        if (!profile || !profile.email) {
          throw new Error(`Korisničko ime "${cleanInput}" nije pronađeno.`);
        }

        targetEmail = profile.email;
      } catch (lookupErr) {
        throw lookupErr;
      }
    }

    // Authenticate with resolved email and password
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: targetEmail,
      password: password
    });

    if (error) throw error;
    return data;
  },

  // Authentication: Sign Out
  async signOut() {
    if (!supabaseClient) {
      localStorage.removeItem('klupice_demo_user');
      return;
    }
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  },

  // Authentication: Get Current User
  async getCurrentUser() {
    if (!supabaseClient) {
      const stored = localStorage.getItem('klupice_demo_user');
      return stored ? JSON.parse(stored) : null;
    }

    try {
      const { data: { user }, error } = await supabaseClient.auth.getUser();
      if (error || !user) return null;
      return user;
    } catch (e) {
      return null;
    }
  },

  // Authentication: Auth State Listener
  onAuthStateChange(callback) {
    if (!supabaseClient) return null;
    return supabaseClient.auth.onAuthStateChange((event, session) => {
      if (callback) callback(event, session);
    });
  },

  // Realtime subscription (benches table changes)
  subscribeToChanges(callback) {
    if (!supabaseClient) return null;
    return supabaseClient
      .channel('public:benches_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'benches' }, payload => {
        if (callback) callback(payload);
      })
      .subscribe();
  }
};
