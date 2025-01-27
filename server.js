const express = require('express');
const basicAuth = require('express-basic-auth');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { fetchAndSaveHtml, getFormattedDate, sanitizeFileName, main } = require('./webdiff'); // 必要な関数をインポート

require('dotenv').config(); // 環境変数を読み込む

const app = express();
const PORT = 4000;

app.use(bodyParser.urlencoded({ extended: true }));

// Basic認証の設定
app.use(basicAuth({
  users: { [process.env.BASIC_AUTH_USER]: process.env.BASIC_AUTH_PASS },
  challenge: true,
}));

// HTMLテンプレートの読み込み
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');

// URLリスト編集画面の表示
app.get('/:suffix?', (req, res) => {
  const suffix = req.params.suffix || '';
  const urlsFile = path.join(__dirname, `conf/urls${suffix}.txt`);
  const mailAddrFile = path.join(__dirname, `conf/mailaddr${suffix}.txt`);

  if (!fs.existsSync(urlsFile) || !fs.existsSync(mailAddrFile)) {
    res.status(404).send('指定されたファイルが存在しません');
    return;
  }

  const urls = fs.readFileSync(urlsFile, 'utf-8');
  const mailAddrs = fs.readFileSync(mailAddrFile, 'utf-8');
  const actionUrl = `/${suffix}`;
  const html = template.replace('{{urls}}', urls)
                       .replace('{{mailAddrs}}', mailAddrs)
                       .replace('{{errors}}', '')
                       .replace('{{actionUrl}}', actionUrl);
  res.send(html);
});

// URLリストとメールアドレスリストの更新と検査
app.post('/:suffix?', async (req, res) => {
  const suffix = req.params.suffix || '';
  const urlsFile = path.join(__dirname, `conf/urls${suffix}.txt`);
  const mailAddrFile = path.join(__dirname, `conf/mailaddr${suffix}.txt`);

  if (!fs.existsSync(urlsFile) || !fs.existsSync(mailAddrFile)) {
    res.status(404).send('指定されたファイルが存在しません');
    return;
  }

  const urls = req.body.urls;
  const mailAddrs = req.body.mailAddrs;
  fs.writeFileSync(urlsFile, urls);
  fs.writeFileSync(mailAddrFile, mailAddrs);

  const today = new Date();
  const formattedToday = getFormattedDate(today);
  const dataDir = '/var/www/html/node/data';
  const errors = [];

  const urlList = urls.split('\n').filter(line => line.trim() !== '');

  for (const line of urlList) {
    const [siteName, url, xpath] = line.split(',');

    if (!siteName || !url) continue;

    const todayFileName = `${formattedToday}_${sanitizeFileName(url + xpath)}.txt`;
    const todayFilePath = path.join(dataDir, todayFileName);

    try {
      await fetchAndSaveHtml(url, todayFilePath, xpath);
    } catch (error) {
      errors.push(`Error fetching ${url}: ${error.message}`);
    }
  }

  const actionUrl = `/${suffix}`;
  const html = template.replace('{{urls}}', urls)
                       .replace('{{mailAddrs}}', mailAddrs)
                       .replace('{{errors}}', errors.join('\n'))
                       .replace('{{actionUrl}}', actionUrl);
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});