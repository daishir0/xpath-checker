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
const urlsFile = path.join(__dirname, 'conf/urls.txt');
const mailLogFile = path.join(__dirname, 'log/mail.log');
const webDiffLogFile = path.join(__dirname, 'log/webdiff.log');
const mailAddrFile = path.join(__dirname, 'conf/mailaddr.txt');
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

// HTMLからテキストを抽出
const extractTextFromHtml = (html) => {
  const dom = new JSDOM(html);
  return dom.window.document.body.textContent || "";
};

// HTMLを取得してファイルに保存
const fetchAndSaveHtml = async (url, fileName, xpath) => {
  if (fs.existsSync(fileName)) {
    console.log(`ファイル${fileName}は既に存在します。`);
    return;
  }

  try {
    const response = await axios.get(url, { timeout: 10000 }); // タイムアウトを10秒に設定
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

    fs.writeFileSync(fileName, html);
    console.log(`HTMLを${fileName}に保存しました。`);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error(`リクエストがタイムアウトしました: ${error.message}`);
    } else {
      console.error(`HTMLの取得に失敗しました: ${error.message}`);
    }
    throw { url, message: error.message }; // URLとエラーメッセージを含むオブジェクトをスロー
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
        const lines = part.value.split('\n').filter(line => line.trim() !== '');
        lines.forEach(line => {
          if (part.added) {
            diffText += '+' + line.trimStart() + '\n';
          } else if (part.removed) {
            //diffText += '-' + line + '\n';
          }
        });
      }
    });
    return diffText;
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
    text: text
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`メールを${to}に送信しました`);
  } catch (error) {
    console.error(`メールの送信に失敗しました: ${error.message}`);
    console.error(error); // 詳細なエラーメッセージを出力
  }
};

// メイン処理
const main = async () => {
  const today = new Date();
  const formattedToday = getFormattedDate(today);
  const formattedDateForSubject = getFormattedDateForSubject(today);

  // URLリストを読み込み
  const urls = fs.readFileSync(urlsFile, 'utf-8').split('\n').filter(line => line.trim() !== '');

  let updateText = '更新あり\n';
  let noUpdateText = '更新なし\n';
  let hasUpdates = false;
  const errors = [];

  for (const line of urls) {
    const [siteName, url, xpath] = line.split(',');

    if (!siteName || !url) continue;

    const todayFileName = `${formattedToday}_${sanitizeFileName(url + xpath)}.txt`;
    const todayFilePath = path.join(dataDir, todayFileName);

    try {
      // 今日のHTMLを取得して保存
      await fetchAndSaveHtml(url, todayFilePath, xpath);

      // 最新のファイルとその1つ前のファイルを探して比較
      const files = findLatestFiles(url + xpath);
      if (files.length === 2) {
        const [latestFile, prevFile] = files;
        const diffText = compareAndDisplayDiff(latestFile, prevFile);

        if (diffText !== '') {
          hasUpdates = true;
          updateText += `${siteName}\n${url}\n\n${diffText}\n`;
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
  const to = fs.readFileSync(mailAddrFile, 'utf-8').split('\n').filter(line => line.trim() !== ''); // 修正
  const subjectPrefix = hasUpdates ? '更新あり：' : '更新なし：';
  const subject = `${subjectPrefix}差分報告（${formattedDateForSubject}）`;
  const text = updateText + '\n' + noUpdateText + '\nErrors:\n' + errors.join('\n'); // エラーを本文に追加

  if (mailsend === 1) {
    for (const email of to) {
      await sendEmail(email, subject, text);
    }
  } else {
    fs.writeFileSync(mailLogFile, `To: ${to.join(', ')}\nSubject: ${subject}\n\n${text}`);
    console.log(`メール内容を${mailLogFile}に保存しました`);
  }

  console.log('Errors:', errors); // デバッグプリント
  return errors; // エラーを返す
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
  main, // 追加
};

// `webdiff.js`を直接実行した場合のみ`main`関数を呼び出す
if (require.main === module) {
  main().catch(console.error);
}