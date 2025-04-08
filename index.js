// index.js

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Funcție asincronă pentru a efectua scraping-ul pe o pagină dată
async function scrapeSite(url) {
  try {
    // Lansează un browser headless (fără interfață grafică)
    const browser = await puppeteer.launch({
      headless: true,
      // Dacă ai nevoie de opțiuni suplimentare de configurare, le poți adăuga aici.
    });
    const page = await browser.newPage();
    console.log(`[scrapeSite] Accesare URL: ${url}`);
    
    // Navighează către URL-ul specificat și așteaptă finalizarea rețelei
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // Extrage email-urile din textul paginii folosind un regex simplu
    const emails = await page.evaluate(() => {
      const regex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
      const pageText = document.body.innerText;
      const found = pageText.match(regex);
      return found || [];
    });
    
    await browser.close();
    return emails;
  } catch (err) {
    console.error(`[scrapeSite] Eroare: ${err}`);
    return [];
  }
}

// Endpointul principal care primește parametru "url" și returnează email-urile găsite
app.get('/', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send('Te rog specifică un URL folosind parametrul ?url=');
  }
  
  const emails = await scrapeSite(url);
  res.json({ emails });
});

app.listen(PORT, () => {
  console.log(`Serverul rulează pe portul ${PORT}`);
});
