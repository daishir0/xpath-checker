const fs = require('fs');
const axios = require('axios');
const path = require('path');
const diff = require('diff');
const nodemailer = require('nodemailer');
const { JSDOM } = require('jsdom');
const dotenv = require('dotenv');

// .envファイルの絶対パスを指定
dotenv.config({ path: path.join(__dirname, '.env') });

const dataDir = '/var/www/html/node/data';
const mailLogFile = path.join(__dirname, 'log/mail.log');
const webDiffLogFile = path.join(__dirname, 'log/webdiff.log');
const mailsend = 1; // 1: メール送信, 0: ログに保存

// 環境変数から認証情報を取得
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM;

// 日付をyyyymmdd-hh形式で取得
const getFormattedDate = (date) => {
  // JST (UTC+9)に変換
  const JST_OFFSET = 9 * 60; // 9時間を分単位に変換
  const utcDate = new Date(date.getTime() + JST_OFFSET * 60000); // 9時間をミリ秒に変換

  const year = utcDate.getFullYear();
  const month = String(utcDate.getMonth() + 1).padStart(2, '0');
  const day = String(utcDate.getDate()).padStart(2, '0');
  const hours = String(utcDate.getHours()).padStart(2, '0');
  return `${year}${month}${day}-${hours}`;
};

// 日付をyyyy/MM/dd形式で取得
const getFormattedDateForSubject = (date) => {
  const JST_OFFSET = 9 * 60; // 9時間を分単位に変換
  const utcDate = new Date(date.getTime() + JST_OFFSET * 60000); // 9時間をミリ秒に変換

  const year = utcDate.getFullYear();
  const month = String(utcDate.getMonth() + 1).padStart(2, '0');
  const day = String(utcDate.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
};

// URLをファイル名に使える文字列に変換
const sanitizeFileName = (url) => {
  return url.replace(/[^\w.-]/g, '_');
};

// HTMLからテキストを抽出（JavaScriptを除外）
const extractTextFromHtml = (html) => {
  // スクリプトタグとその内容を完全に除去
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  const dom = new JSDOM(html);
  const document = dom.window.document;

  // その他の不要な要素を削除
  const elementsToRemove = document.querySelectorAll('style, noscript, iframe');
  elementsToRemove.forEach(el => el.remove());

  // インラインJavaScriptイベントハンドラを除去
  const allElements = document.getElementsByTagName('*');
  for (let el of allElements) {
    for (let attr of el.attributes) {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
  }

  // テキストノードのみを抽出し、適切に整形する
  const extractTextNodes = (node) => {
    let result = '';
    if (node.nodeType === 3) { // テキストノード
      result = node.textContent;
    } else if (node.nodeType === 1) { // 要素ノード
      for (let child of node.childNodes) {
        result += extractTextNodes(child);
      }
      if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br'].includes(node.tagName.toLowerCase())) {
        result += '\n';
      }
    }
    return result;
  };

  return extractTextNodes(document.body)
    .replace(/\n{3,}/g, '\n\n') // 3つ以上の連続した改行を2つに減らす
    .trim();
};

// HTMLを取得してファイルに保存
const fetchAndSaveHtml = async (url, fileName, xpath) => {
  if (fs.existsSync(fileName)) {
    console.log(`ファイル${fileName}は既に存在します。`);
    return;
  }

  try {
    const response = await axios.get(url, { timeout: 10000 });
    let html = response.data;

    if (xpath) {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const element = document.evaluate(xpath, document, null, dom.window.XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (element) {
        html = element.outerHTML;
      } else {
        console.warn(`XPATHで指定された要素が見つかりませんでした: ${xpath}`);
      }
    }

    // 元のHTMLをそのまま保存
    fs.writeFileSync(fileName, html);
    console.log(`HTMLを${fileName}に保存しました。`);
  } catch (error) {
    console.error(`HTMLの取得に失敗しました: ${error.message}`);
    throw { url, message: error.message };
  }
};

// ファイルの差分を比較して表示
const compareAndDisplayDiff = (file1, file2) => {
  if (!fs.existsSync(file1) || !fs.existsSync(file2)) {
    return '';
  }
  console.log(`比較するファイル: ${file1} と ${file2}`);
  const content1 = extractTextFromHtml(fs.readFileSync(file1, 'utf-8'));
  const content2 = extractTextFromHtml(fs.readFileSync(file2, 'utf-8'));

  if (content1 === content2) {
    console.log('差分なし');
    return '';
  } else {
    console.log('差分あり');
    const differences = diff.diffLines(content2, content1);
    let diffText = '';
    differences.forEach((part) => {
      if (part.added || part.removed) {
        const lines = part.value.split('\n');
        lines.forEach(line => {
          if (part.added && line.trim() !== '') {
            diffText += '+' + line + '\n';
          } else if (part.removed) {
            // diffText += '-' + line + '\n';
          }
        });
      } else {
        // 変更がない部分も保持する場合
        // diffText += part.value;
      }
    });
    return diffText.trim(); // 最後の余分な改行を削除
  }
};

// 指定されたURLに対応する最新のファイルとその1つ前のファイルを探す
const findLatestFiles = (url) => {
  const files = fs.readdirSync(dataDir).filter(file => file.includes(sanitizeFileName(url)));
  if (files.length < 2) return []; // 比較するためには少なくとも2つファイルが必要

  files.sort((a, b) => {
    const aDate = new Date(a.split('_')[0].replace(/(\d{4})(\d{2})(\d{2})-(\d{2})/, '$1-$2-$3T$4:00:00'));
    const bDate = new Date(b.split('_')[0].replace(/(\d{4})(\d{2})(\d{2})-(\d{2})/, '$1-$2-$3T$4:00:00'));
    return bDate - aDate;
  });

  return [path.join(dataDir, files[0]), path.join(dataDir, files[1])]; // 最新のファイルとその1つ前のファイルを返す
};

// メールを送信する関数
const sendEmail = async (to, subject, text) => {
  const transporter = nodemailer.createTransport({
    // SMTPサーバーの設定を行ってください
    // 例: Gmail の場合
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });

  const mailOptions = {
    from: EMAIL_FROM,
    to: to,
    subject: subject,
    text: text,
    html: text.replace(/\n/g, '<br>')
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`メールを${to}に送信しました`);
  } catch (error) {
    console.error(`メールの送信に失敗しました: ${error.message}`);
    console.error(error); // 詳細なエラーメッセージを出力
  }
};

// ファイルの接尾辞を検出
const detectFileSuffixes = (dir, baseName) => {
  const files = fs.readdirSync(dir);
  console.log(`検出されたファイル: ${files.join(', ')}`);
  const suffixes = files
    .filter(file => file.startsWith(baseName) && !file.endsWith('.org'))
    .map(file => {
      if (file === `${baseName}.txt`) {
        return '';
      }
      return file.replace(baseName, '').replace('.txt', '');
    });
  console.log(`検出された接尾辞: ${suffixes.join(', ')}`);
  return suffixes;
};

// メイン処理
const main = async () => {
  const today = new Date();
  const formattedToday = getFormattedDate(today);
  const formattedDateForSubject = getFormattedDateForSubject(today);

  console.log('メイン処理を開始します。');

  // confディレクトリ内のurlsファイルの接尾辞を検出
  const urlSuffixes = detectFileSuffixes(path.join(__dirname, 'conf'), 'urls');
  console.log(`処理する接尾辞: ${urlSuffixes.join(', ')}`);

  for (const suffix of urlSuffixes) {
    const urlsFile = path.join(__dirname, `conf/urls${suffix}.txt`);
    const mailAddrFile = path.join(__dirname, `conf/mailaddr${suffix}.txt`);

    console.log(`処理中のファイル: ${urlsFile}`);

    if (!fs.existsSync(urlsFile)) {
      console.log(`ファイルが存在しません: ${urlsFile}`);
      continue;
    }

    // URLリストを読み込み
    const urls = fs.readFileSync(urlsFile, 'utf-8').split('\n').filter(line => line.trim() !== '');
    console.log(`読み込まれたURL数: ${urls.length}`);

    let updateText = '# 更新あり\n';
    let noUpdateText = '# 更新なし\n';
    let hasUpdates = false;
    const errors = [];

    for (const line of urls) {
      const [siteName, url, xpath] = line.split(',');
      console.log(`処理中のサイト: ${siteName}, URL: ${url}`);

      try {
        // 今日のHTMLを取得して保存
        const fullPath = path.join(dataDir, `${formattedToday}_${sanitizeFileName(url + xpath)}.txt`);
        await fetchAndSaveHtml(url, fullPath, xpath);

        // 最新のファイルとその1つ前のファイルを探して比較
        const files = findLatestFiles(url + xpath);
        if (files.length === 2) {
          const [latestFile, prevFile] = files;
          const diffText = compareAndDisplayDiff(latestFile, prevFile);
          if (diffText !== '') {
            hasUpdates = true;
            const cleanedDiffText = diffText
              .split('\n')
              .filter(line => line.trim() !== '')
              .join('\n');
            updateText += `\n## ${siteName}\n${url}\n\n${cleanedDiffText}\n`;
          } else {
            noUpdateText += `${siteName}\n`;
          }
        } else {
          noUpdateText += `${siteName}\n`;
        }
      } catch (error) {
        errors.push(`Error fetching ${url}: ${error.message}`);
      }
    }

    // 差分があるかどうかに関係なくメールを送信
    const to = fs.readFileSync(mailAddrFile, 'utf-8').split('\n').filter(line => line.trim() !== '');
    const subjectPrefix = hasUpdates ? '更新あり：' : '更新なし：';
    const subject = `${subjectPrefix}差分報告（${formattedDateForSubject}）`;
    const text = updateText + '\n' + noUpdateText + '\n# Errors:\n' + errors.join('\n'); // エラーを本文に追加

    if (mailsend === 1) {
      for (const email of to) {
        await sendEmail(email, subject, text);
      }
    } else {
      fs.writeFileSync(mailLogFile, `To: ${to.join(', ')}\nSubject: ${subject}\n\n${text}`);
      console.log(`メール内容を${mailLogFile}に保存しました`);
    }

    console.log('Errors:', errors); // デバッグプリント
    console.log(`${urlsFile}の処理が完了しました。`);
  }

  console.log('すべての処理が完了しました。');
};

// `main`関数をエクスポート
module.exports = {
  fetchAndSaveHtml,
  getFormattedDate,
  sanitizeFileName,
  extractTextFromHtml,
  compareAndDisplayDiff,
  findLatestFiles,
  sendEmail,
  main,
};

// `webdiff.js`を直接実行した場合のみ`main`関数を呼び出す
if (require.main === module) {
  main().catch(console.error);
}