// index.js

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/**
 * GET /scrape?url=...
 */
app.get('/scrape', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'Parametrul ?url= lipsă' });
    }
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    console.log(`[SCRAPE] Merg la URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    const result = await page.evaluate(() => {
      const textNodes = Array.from(document.querySelectorAll('p'))
        .map(el => el.innerText.trim())
        .filter(t => t.length > 0);
      const imageLinks = Array.from(document.querySelectorAll('img'))
        .map(img => img.src);
      return { url: window.location.href, textParagraphs: textNodes, images: imageLinks };
    });
    await browser.close();
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SCRAPE] Eroare:', err);
    return res.status(500).json({ error: err.message });
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
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    console.log('[FACEBOOK] Deschidem Facebook Login...');
    await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2' });
    await page.type('input[name=email]', email, { delay: 50 });
    await page.type('input[name=pass]', password, { delay: 50 });
    await page.click('button[name=login]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    const pageContent = await page.content();
    if (pageContent.includes('login_error')) {
      console.log('[FACEBOOK] Login error detectat.');
      await browser.close();
      return res.status(401).json({ error: 'Login Facebook a eșuat. Verifică user/parola sau captcha.' });
    }
    console.log('[FACEBOOK] Login reușit (teoretic). Mergem la feed...');
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
    const posts = await page.evaluate(() => {
      const postElements = Array.from(document.querySelectorAll('div[data-pagelet^="FeedUnit_"]'));
      let results = [];
      for (let i = 0; i < 5; i++) {
        const el = postElements[i];
        if (!el) break;
        const textEl = el.querySelector('[role="article"]');
        const text = textEl ? textEl.innerText : '';
        const imgEl = el.querySelector('img');
        const imgSrc = imgEl ? imgEl.src : null;
        results.push({ text, image: imgSrc });
      }
      return results;
    });
    await browser.close();
    return res.json({ success: true, posts });
  } catch (err) {
    console.error('[FACEBOOK] Eroare la login/scrape:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /login-linkedin
 * Body: { "email": "...", "password": "..." }
 */
app.post('/login-linkedin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Trimite email și password în body (JSON).' });
    }
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    console.log('[LINKEDIN] Deschidem LinkedIn login...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2' });
    await page.type('input[name=session_key]', email, { delay: 50 });
    await page.type('input[name=session_password]', password, { delay: 50 });
    await page.click('button[type=submit]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    const currentUrl = page.url();
    if (currentUrl.includes('/checkpoint/challenge')) {
      console.log('[LINKEDIN] 2FA/Challenge detectat.');
      await browser.close();
      return res.status(401).json({ error: 'Login LinkedIn a cerut 2FA/Challenge.' });
    }
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2' });
    const posts = await page.evaluate(() => {
      const postElements = Array.from(document.querySelectorAll('[data-id^="urn:li:activity"]'));
      let results = [];
      for (let i = 0; i < 5; i++) {
        const el = postElements[i];
        if (!el) break;
        const textEl = el.querySelector('.update-components-text');
        const text = textEl ? textEl.innerText : '';
        const imgEl = el.querySelector('img');
        const imgSrc = imgEl ? imgEl.src : null;
        results.push({ text, image: imgSrc });
      }
      return results;
    });
    await browser.close();
    return res.json({ success: true, posts });
  } catch (err) {
    console.error('[LINKEDIN] Eroare la login/scrape:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server pornit pe portul ${PORT}`));
