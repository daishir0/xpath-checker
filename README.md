# xpath-checker

## Overview
`xpath-checker` is a tool designed to monitor changes in specific parts of web pages using XPath. It fetches the HTML content of specified URLs, compares the content with previous versions, and sends email notifications if any changes are detected.

## Installation
1. Clone the repository:
    ```sh
    git clone https://github.com/daishir0/xpath-checker.git
    cd xpath-checker
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

3. Prepare the configuration files:
    - Create `conf/urls.txt.org` and `conf/mailaddr.txt.org` as sample configuration files.
    - Rename them to `urls.txt` and `mailaddr.txt` respectively, and fill in the necessary information.

    `conf/urls.txt`:
    ```
    site_name_1,url_1,xpath_1
    site_name_2,url_2,xpath_2
    ```

    `conf/mailaddr.txt`:
    ```
    email1@example.com
    email2@example.com
    ```

4. Create a `.env` file in the root directory and add your email and Basic Auth credentials:
    ```plaintext
    EMAIL_USER=your_email_user
    EMAIL_PASS=your_email_pass
    EMAIL_FROM=your_email_from
    BASIC_AUTH_USER=your_basic_auth_user
    BASIC_AUTH_PASS=your_basic_auth_pass
    ```

## Usage
1. Start the server to maintain the target sites and email addresses:
    ```sh
    npm start
    ```

2. Access the maintenance page at `http://localhost:4000` to update the URL list and email addresses.

3. Run the main script to check for updates:
    ```sh
    node webdiff.js
    ```

## Notes
- Ensure that the `data/` and `log/` directories exist and contain a `.gitkeep` file to keep them in the repository.
- The `conf/urls.txt` and `conf/mailaddr.txt` files should not be committed to the repository as they contain sensitive information.

## License
This project is licensed under the MIT License - see the LICENSE file for details.

---

# xpath-checker

## 概要
`xpath-checker`は、XPathを使用してウェブページの特定の部分の変更を監視するツールです。指定されたURLのHTMLコンテンツを取得し、以前のバージョンと比較して、変更が検出された場合にメール通知を送信します。

## インストール方法
1. リポジトリをクローンします:
    ```sh
    git clone https://github.com/daishir0/xpath-checker.git
    cd xpath-checker
    ```

2. 依存関係をインストールします:
    ```sh
    npm install
    ```

3. 設定ファイルを準備します:
    - `conf/urls.txt.org`と`conf/mailaddr.txt.org`をサンプル設定ファイルとして作成します。
    - それらを`urls.txt`と`mailaddr.txt`にリネームし、必要な情報を記入します。

    `conf/urls.txt`:
    ```
    site_name_1,url_1,xpath_1
    site_name_2,url_2,xpath_2
    ```

    `conf/mailaddr.txt`:
    ```
    email1@example.com
    email2@example.com
    ```

4. ルートディレクトリに`.env`ファイルを作成し、メールおよびBasic認証の資格情報を追加します:
    ```plaintext
    EMAIL_USER=your_email_user
    EMAIL_PASS=your_email_pass
    EMAIL_FROM=your_email_from
    BASIC_AUTH_USER=your_basic_auth_user
    BASIC_AUTH_PASS=your_basic_auth_pass
    ```

## 使い方
1. 対象サイトとメールアドレスをメンテナンスするためにサーバーを起動します:
    ```sh
    npm start
    ```

2. `http://localhost:4000`のメンテナンスページにアクセスして、URLリストとメールアドレスを更新します。

3. メインスクリプトを実行して更新を確認します:
    ```sh
    node webdiff.js
    ```

## 注意点
- `data/`および`log/`ディレクトリが存在し、それらに`.gitkeep`ファイルが含まれていることを確認してください。
- `conf/urls.txt`および`conf/mailaddr.txt`ファイルは機密情報を含むため、リポジトリにコミットしないでください。

## ライセンス
このプロジェクトはMITライセンスの下でライセンスされています。詳細はLICENSEファイルを参照してください。