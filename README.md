# Telegram Media Downloader

A Chrome extension for downloading photos and videos from a specific Telegram Web message.

This was built as a personal project to explore Chrome Extension APIs, DOM interaction, media handling, and browser-side JavaScript.

## Features

- Paste a Telegram message link and locate the corresponding message in Telegram Web
- Detect photos and videos inside the message
- Download supported media through Chrome's Downloads API
- Convert `blob:` media to downloadable data when possible
- Show basic download status and progress
- Highlight the matched Telegram message in the page

## Tech stack

- JavaScript
- HTML
- CSS
- Chrome Extension Manifest V3
- Chrome Tabs / Runtime / Downloads APIs
- DOM APIs, `MutationObserver`, `MediaRecorder`, `FileReader`

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder.
6. Open [Telegram Web](https://web.telegram.org/) and sign in.

## Usage

1. Open Telegram Web in the active tab.
2. Copy the link to the Telegram message containing the media.
3. Open the extension.
4. Paste the message link.
5. Click **Fetch Media**.
6. Choose **Download** next to the detected item.

## Project structure

- `manifest.json` — Chrome extension configuration
- `popup.html` — popup interface
- `popup.css` — popup styling
- `popup.js` — popup logic and message handling
- `content.js` — finds Telegram messages/media and prepares media for downloading
- `background.js` — starts downloads through the Chrome Downloads API

## Limitations

Telegram Web changes frequently, so DOM selectors may need updates over time.

Some video sources use `blob:` URLs or browser-specific codecs. The extension attempts to handle these using `fetch`, `FileReader`, and `MediaRecorder`, but not every Telegram media type is guaranteed to work.

For large videos, converting media to data URLs can use significant memory. A future version could improve large-file handling and reduce in-memory conversion.

## Privacy

The extension does not send Telegram content to an external server. Media processing is performed locally in the browser.

## Disclaimer

Use this project only for media that you have permission to access and download. Respect copyright, privacy, and Telegram's terms of service.
