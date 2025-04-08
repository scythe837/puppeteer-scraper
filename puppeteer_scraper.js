const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']  // often needed in hosted environments
  });
  const page = await browser.newPage();
  const url = process.argv[2] || 'http://www.erbasu.ro/';
  await page.goto(url, { waitUntil: 'networkidle2' });
  const htmlContent = await page.content();
  const outputPath = process.argv[3] || 'output.html';
  const fs = require('fs');
  fs.writeFileSync(outputPath, htmlContent, 'utf8');
  console.log(`Saved HTML to ${outputPath}`);
  await browser.close();
})();
