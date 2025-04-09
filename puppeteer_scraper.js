// puppeteer-scraper.js

const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    const url = process.argv[2] || 'http://www.google.ro/';
    const outputPath = process.argv[3] || 'output.json';

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const result = await page.evaluate(() => {
      const textNodes = Array.from(document.querySelectorAll('p'))
        .map(el => el.innerText.trim())
        .filter(t => t.length > 0);
      const imageLinks = Array.from(document.querySelectorAll('img'))
        .map(img => img.src);
      return { url: window.location.href, textParagraphs: textNodes, images: imageLinks };
    });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Salvat în ${outputPath}`);
    await browser.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
