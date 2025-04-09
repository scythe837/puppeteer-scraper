// index.js
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Optiuni comune pentru Puppeteer în medii containerizate
const puppeteerOptions = {
  headless: true, 
  // IMPORTANT: Argumentele necesare pe Render/Linux
  args: [
    '--no-sandbox', // Necesar în multe medii containerizate
    '--disable-setuid-sandbox', // Securitate sporită
    '--disable-dev-shm-usage', // Probleme legate de memoria partajată limitată
    '--disable-accelerated-2d-canvas', // Poate preveni unele crash-uri
    '--no-first-run',
    '--no-zygote',
    // '--single-process', // Uneori util, dar poate reduce stabilitatea
    '--disable-gpu' // Necesar în mod headless
  ]
};

// Funcție helper pentru a lansa browser-ul și a închide corect
async function launchBrowserAndExecute(logic) {
  let browser = null;
  try {
    console.log('[PUPPETEER] Lansare browser cu opțiunile:', JSON.stringify(puppeteerOptions));
    // Asigură-te că Puppeteer folosește cache-ul specificat prin env var
    browser = await puppeteer.launch(puppeteerOptions); 
    console.log('[PUPPETEER] Browser lansat.');
    const result = await logic(browser);
    console.log('[PUPPETEER] Închidere browser...');
    await browser.close();
    console.log('[PUPPETEER] Browser închis.');
    return result;
  } catch (err) {
    console.error('[PUPPETEER] Eroare în timpul execuției:', err);
    if (browser) {
      console.log('[PUPPETEER] Încercare forțată de închidere browser...');
      await browser.close();
      console.log('[PUPPETEER] Browser închis (după eroare).');
    }
    // Rethrow eroarea pentru a fi prinsă de handlerul rutei
    throw err; 
  }
}

/**
 * GET /scrape?url=...
 */
app.get('/scrape', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'Parametrul ?url= lipsă' });
    }

    const result = await launchBrowserAndExecute(async (browser) => {
      const page = await browser.newPage();
      console.log(`[SCRAPE] Merg la URL: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Mărește timeout-ul
      const data = await page.evaluate(() => {
        const textNodes = Array.from(document.querySelectorAll('p'))
          .map(el => el.innerText.trim())
          .filter(t => t.length > 0);
        const imageLinks = Array.from(document.querySelectorAll('img'))
          .map(img => img.src);
        return { url: window.location.href, textParagraphs: textNodes, images: imageLinks };
      });
      await page.close(); // Închide pagina explicit
      return data;
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SCRAPE] Eroare în handler:', err);
    // Verifică tipul erorii pentru un mesaj mai specific, dacă e timeout etc.
    if (err.name === 'TimeoutError') {
        return res.status(504).json({ error: 'Timeout la încărcarea paginii.', details: err.message });
    }
    return res.status(500).json({ error: 'Eroare server la scrape.', details: err.message });
  }
});

/**
 * POST /login-facebook
 * Body: { "email": "...", "password": "..." }
 */
app.post('/login-facebook', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Te rog trimite email și password în body (JSON).' });
    }

    const result = await launchBrowserAndExecute(async (browser) => {
      const page = await browser.newPage();
      console.log('[FACEBOOK] Deschidem Facebook Login...');
      // Setăm un User-Agent realist
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');
      await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2', timeout: 60000 });
      
      console.log('[FACEBOOK] Introducem credentiale...');
      await page.type('input[name=email]', email, { delay: 50 });
      await page.type('input[name=pass]', password, { delay: 50 });
      
      console.log('[FACEBOOK] Click pe login...');
      // Folosim Promise.all pentru a aștepta navigarea după click
      await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
          page.click('button[name=login]')
      ]);

      const pageContent = await page.content();
      if (pageContent.includes('login_error') || page.url().includes('login/device-based/regular/login/')) {
        console.log('[FACEBOOK] Login error detectat sau redirect neașteptat.');
        await page.close();
        // Nu arunca eroare aici, lasă browser.close() din finally să se ocupe
        return { loginError: true }; 
      }

      console.log('[FACEBOOK] Login reușit (teoretic). Mergem la feed...');
      await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 60000 });
      
      console.log('[FACEBOOK] Extragem postările...');
      const posts = await page.evaluate(() => {
          // Selectorul poate necesita ajustare frecventă
          const postElements = Array.from(document.querySelectorAll('div[role="feed"] div[data-pagelet^="FeedUnit_"]')); 
          let results = [];
          const maxPosts = 5; // Limitează numărul
          for (let i = 0; i < Math.min(postElements.length, maxPosts); i++) {
              const el = postElements[i];
              if (!el) continue;
              // Extrage textul mai robust
              const textContent = el.innerText || ''; 
              const imgEl = el.querySelector('img');
              const imgSrc = imgEl ? imgEl.src : null;
              // Filtrează postările goale sau reclamele dacă e posibil
              if (textContent.trim().length > 10) { 
                  results.push({ text: textContent.substring(0, 500), image: imgSrc }); // Limitează lungimea textului
              }
          }
          return results;
      });
      await page.close();
      return { success: true, posts };
    });

    if (result.loginError) {
      return res.status(401).json({ error: 'Login Facebook a eșuat. Verifică user/parola, captcha sau 2FA.' });
    }

    return res.json(result); // Trimite { success: true, posts }

  } catch (err) {
    console.error('[FACEBOOK] Eroare în handler:', err);
     if (err.name === 'TimeoutError') {
        return res.status(504).json({ error: 'Timeout la operațiunea Facebook.', details: err.message });
    }
    return res.status(500).json({ error: 'Eroare server la login/scrape Facebook.', details: err.message });
  }
});


// Endpointul LinkedIn (similar cu Facebook, necesită adaptare selectoare)
app.post('/login-linkedin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Trimite email și password în body (JSON).' });
    }

    const result = await launchBrowserAndExecute(async (browser) => {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');
      console.log('[LINKEDIN] Deschidem LinkedIn login...');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2', timeout: 60000 });

      console.log('[LINKEDIN] Introducem credentiale...');
      await page.type('#username', email, { delay: 50 }); // ID-ul poate fi #username sau #session_key
      await page.type('#password', password, { delay: 50 }); // ID-ul poate fi #password sau #session_password
      
      console.log('[LINKEDIN] Click pe login...');
       await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
          page.click('button[type=submit]') // Sau selector mai specific
      ]);

      const currentUrl = page.url();
      if (currentUrl.includes('/checkpoint/challenge') || currentUrl.includes('/login-submit')) {
          console.log('[LINKEDIN] 2FA/Challenge sau eroare login detectată.');
          await page.close();
          return { loginError: true, reason: 'Challenge/2FA or Login Error' };
      }
       if (!currentUrl.includes('/feed/')) {
           console.log('[LINKEDIN] Nu am ajuns pe pagina de feed. URL curent:', currentUrl);
           // Poate fi o pagină intermediară, eroare, etc.
           // Încercăm să mergem explicit la feed
           await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2', timeout: 60000 });
           if (!page.url().includes('/feed/')) {
               await page.close();
               return { loginError: true, reason: 'Could not navigate to feed' };
           }
       }

      console.log('[LINKEDIN] Extragem postările din feed...');
      // Selectorul pentru postări pe LinkedIn se schimbă des! Necesită verificare.
      const posts = await page.evaluate(() => {
          const postElements = Array.from(document.querySelectorAll('div.feed-shared-update-v2')); // Acest selector e probabil învechit
          let results = [];
          const maxPosts = 5;
          for (let i = 0; i < Math.min(postElements.length, maxPosts); i++) {
              const el = postElements[i];
              if (!el) continue;
              const textEl = el.querySelector('.feed-shared-update-v2__description-wrapper'); // Verifică acest selector
              const text = textEl ? textEl.innerText.trim() : '';
              const imgEl = el.querySelector('img.ivm-view-attr__img--centered'); // Verifică acest selector
              const imgSrc = imgEl ? imgEl.src : null;
               if (text.length > 10) { // Filtrare simplă
                   results.push({ text: text.substring(0, 500), image: imgSrc });
               }
          }
          return results;
      });
      await page.close();
      return { success: true, posts };
    });

     if (result.loginError) {
      return res.status(401).json({ error: `Login LinkedIn a eșuat: ${result.reason || 'Necunoscut'}. Verifică user/parola, captcha sau 2FA.` });
    }

    return res.json(result);

  } catch (err) {
    console.error('[LINKEDIN] Eroare în handler:', err);
    if (err.name === 'TimeoutError') {
        return res.status(504).json({ error: 'Timeout la operațiunea LinkedIn.', details: err.message });
    }
    return res.status(500).json({ error: 'Eroare server la login/scrape LinkedIn.', details: err.message });
  }
});


app.listen(PORT, () => console.log(`Server pornit pe portul ${PORT}`));
