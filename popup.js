document.addEventListener('DOMContentLoaded', () => {
  const messageUrlInput = document.getElementById('messageUrl');
  const fetchMediaBtn = document.getElementById('fetchMediaBtn');
  const mediaContainer = document.getElementById('mediaContainer');
  const status = document.getElementById('status');
  let downloadIdCounter = 0;

  fetchMediaBtn.addEventListener('click', () => {
    const url = (messageUrlInput.value || '').trim();

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      status.textContent = 'Please enter a valid Telegram message link.';
      return;
    }

    const isTelegramLink =
      parsedUrl.hostname === 'web.telegram.org' ||
      (parsedUrl.hostname === 't.me' && parsedUrl.pathname.startsWith('/c/'));

    if (!isTelegramLink) {
      status.textContent = 'Use a Telegram Web link or a t.me/c/... message link.';
      return;
    }

    status.textContent = 'Fetching message...';
    mediaContainer.innerHTML = '';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        status.textContent = 'Please open Telegram Web in a tab.';
        return;
      }
      const tab = tabs[0];
      if (!tab || !tab.url || !tab.url.includes('web.telegram.org')) {
        status.textContent = 'Active tab is not Telegram Web. Switch to Telegram Web and try again.';
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'fetchMessage', url: url }, (resp) => {
        // optional callback; content.js will send messages back via chrome.runtime.sendMessage
      });
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.action) return;
    if (message.action === 'messageMediaFound') {
      status.textContent = '';
      const media = message.media || [];
      if (media.length === 0) {
        status.textContent = 'No media found in this message.';
        return;
      }
      media.forEach(item => renderMediaItem(item));
    } else if (message.action === 'downloadProgress') {
      const infoEl = document.querySelector(`.media-info[data-download-id='${message.downloadId}']`);
      if (infoEl) infoEl.textContent = `Downloading: ${message.progress}%`;
    } else if (message.action === 'downloadStarted') {
      const infoEl = document.querySelector(`.media-info[data-download-id='${message.downloadId}']`);
      if (infoEl) infoEl.textContent = 'Download started...';
    } else if (message.action === 'downloadComplete') {
      const infoEl = document.querySelector(`.media-info[data-download-id='${message.downloadId}']`);
      if (infoEl) infoEl.textContent = 'Download finished!';
      const btn = document.querySelector(`.media-download-btn[data-download-id='${message.downloadId}']`);
      if (btn) btn.disabled = false;
    } else if (message.action === 'fetchError') {
      status.textContent = message.error || 'Fetch error';
    } else if (message.action === 'downloadError') {
      const infoEl = document.querySelector(`.media-info[data-download-id='${message.downloadId}']`);
      if (infoEl) infoEl.textContent = `Error: ${message.error}`;
      const btn = document.querySelector(`.media-download-btn[data-download-id='${message.downloadId}']`);
      if (btn) btn.disabled = false;
    }
  });

  function renderMediaItem(mediaItem) {
    const downloadId = downloadIdCounter++;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'media-item';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'media-info';
    infoDiv.textContent = mediaItem.mediaName || 'Media';
    infoDiv.setAttribute('data-download-id', downloadId);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'media-download-btn';
    downloadBtn.textContent = 'Download';
    downloadBtn.setAttribute('data-download-id', downloadId);

    downloadBtn.onclick = () => {
      downloadBtn.disabled = true;
      infoDiv.textContent = 'Starting...';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          infoDiv.textContent = 'No Telegram tab found.';
          downloadBtn.disabled = false;
          return;
        }
        const tab = tabs[0];
        chrome.tabs.sendMessage(tab.id, {
          action: 'downloadMedia',
          mediaSrc: mediaItem.mediaSrc,
          mediaType: mediaItem.mediaType,
          downloadId: downloadId,
        });
      });
    };
    
    itemDiv.appendChild(infoDiv);
    itemDiv.appendChild(downloadBtn);
    mediaContainer.appendChild(itemDiv);
  }
});