const activeDownloads = new Map();

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta || !delta.id || !activeDownloads.has(delta.id)) return;

  const downloadId = activeDownloads.get(delta.id);

  if (delta.state && delta.state.current === 'complete') {
    chrome.runtime.sendMessage({ action: 'downloadComplete', downloadId });
    activeDownloads.delete(delta.id);
  } else if (delta.state && delta.state.current === 'interrupted') {
    chrome.runtime.sendMessage({
      action: 'downloadError',
      downloadId,
      error: 'Chrome interrupted the download.'
    });
    activeDownloads.delete(delta.id);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  if (message.action === 'dispatchDownload') {
    const src = message.src;
    const downloadId = message.downloadId;
    let filename = `telegram-download-${Date.now()}.dat`;

    try {
      if (typeof src === 'string' && src.startsWith('data:')) {
        const mimeType = (src.match(/data:([^;]+);/) || [])[1] || '';
        let extension = 'dat';
        let mediaPrefix = 'telegram-media';

        if (mimeType) {
          const [type, specific] = mimeType.split('/');
          if (specific) extension = specific.split('+')[0];
          if (type === 'video') mediaPrefix = 'telegram-video';
          else if (type === 'image') mediaPrefix = 'telegram-photo';
          if (extension === 'jpeg') extension = 'jpg';
        }
        filename = `${mediaPrefix}-${Date.now()}.${extension}`;
      } else if (typeof src === 'string') {
        // try to infer extension from URL
        try {
          const url = new URL(src);
          const pathname = url.pathname || '';
          const extMatch = pathname.match(/\.(\w{2,5})(?:$|\?)/);
          const ext = extMatch ? extMatch[1] : 'dat';
          filename = `telegram-download-${Date.now()}.${ext}`;
        } catch (e) {
          filename = `telegram-download-${Date.now()}.dat`;
        }
      }
    } catch (e) {
      filename = `telegram-download-${Date.now()}.dat`;
    }

    chrome.downloads.download({
      url: src,
      filename: filename,
      saveAs: true,
    }, (downloadItemId) => {
      if (chrome.runtime.lastError) {
        // notify popup about error
        chrome.runtime.sendMessage({ action: 'downloadError', downloadId, error: chrome.runtime.lastError.message });
      } else {
        activeDownloads.set(downloadItemId, downloadId);
        chrome.runtime.sendMessage({ action: 'downloadStarted', downloadId, internalId: downloadItemId });
      }
    });
  }
});