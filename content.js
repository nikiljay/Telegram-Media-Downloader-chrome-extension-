async function waitForMessageElement(messageId, timeout = 6000) {
    const start = Date.now();
    const selectorExact = `[data-mid="${messageId}"], .bubble-media-container[data-mid*="${messageId}"]`;
    const find = () => document.querySelector(selectorExact) || Array.from(document.querySelectorAll('[data-mid]')).find(el => {
        if (!el.dataset || !el.dataset.mid) return false;
        return el.dataset.mid === messageId || el.dataset.mid.includes(messageId);
    });

    let el = find();
    if (el) return el;

    return await new Promise((resolve) => {
        const obs = new MutationObserver(() => {
            const found = find();
            if (found) {
                obs.disconnect();
                resolve(found);
            } else if (Date.now() - start > timeout) {
                obs.disconnect();
                resolve(null);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            obs.disconnect();
            resolve(find());
        }, timeout);
    });
}

// helper: extract media srcs from a message element (broad selectors)
function extractMediaFromElement(el) {
    const items = [];
    if (!el) return items;

    // video tags
    Array.from(el.querySelectorAll('video')).forEach(v => {
        const src = v.currentSrc || v.src || (v.querySelector('source') && v.querySelector('source').src) || null;
        if (src) items.push({ mediaName: 'Video', mediaSrc: src, mediaType: 'video' });
    });

    // img tags and <picture>
    Array.from(el.querySelectorAll('img, picture img')).forEach(img => {
        const src = img.currentSrc || img.src || null;
        if (src) items.push({ mediaName: 'Photo', mediaSrc: src, mediaType: 'photo' });
    });

    // elements using background-image (inline style)
    Array.from(el.querySelectorAll('[style*="background-image"]')).forEach(node => {
        try {
            const bg = node.style.backgroundImage || '';
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1]) items.push({ mediaName: 'Photo', mediaSrc: m[1], mediaType: 'photo' });
        } catch (e) { /* ignore */ }
    });

    // anchors that may point to file URLs
    Array.from(el.querySelectorAll('a[href]')).forEach(a => {
        const href = a.getAttribute('href') || '';
        if (href && (href.endsWith('.jpg') || href.endsWith('.png') || href.endsWith('.webp') || href.includes('/file/'))) {
            items.push({ mediaName: 'Attachment', mediaSrc: href, mediaType: 'photo' });
        }
    });

    // dedupe by src
    const seen = new Set();
    return items.filter(it => {
        if (!it.mediaSrc) return false;
        if (seen.has(it.mediaSrc)) return false;
        seen.add(it.mediaSrc);
        return true;
    });
}

function waitForMediaInElement(el, timeout = 2500) {
    return new Promise((resolve) => {
        const found = extractMediaFromElement(el);
        if (found.length) return resolve(found);

        const start = Date.now();
        const obs = new MutationObserver(() => {
            const f = extractMediaFromElement(el);
            if (f.length) {
                obs.disconnect();
                resolve(f);
            } else if (Date.now() - start > timeout) {
                obs.disconnect();
                resolve([]);
            }
        });
        obs.observe(el, { childList: true, subtree: true, attributes: true });
        setTimeout(() => {
            obs.disconnect();
            resolve(extractMediaFromElement(el));
        }, timeout);
    });
}

async function getMediaFromMessage(url) {
  try {
    if (!url) throw new Error('No URL provided');
    const parts = url.replace(/\/+$/, '').split('/');
    const chatId = parts[parts.length - 2] || '';
    const messageId = parts[parts.length - 1] || '';

    if (chatId) window.location.hash = `#-${chatId}`;

    const messageEl = await waitForMessageElement(messageId, 6000);

    if (!messageEl) {
      // Best-effort "closest" fallback
      const allMessages = Array.from(document.querySelectorAll('[data-mid]')).filter(m => m.dataset && m.dataset.mid);
      if (allMessages.length) {
        const targetNum = parseInt(messageId.replace(/\D/g, ''), 10) || null;
        const closest = allMessages.reduce((prev, curr) => {
          const prevNum = parseInt((prev.dataset.mid || '').replace(/\D/g, ''), 10) || 0;
          const currNum = parseInt((curr.dataset.mid || '').replace(/\D/g, ''), 10) || 0;
          if (targetNum === null) return curr;
          return (Math.abs(currNum - targetNum) < Math.abs(prevNum - targetNum) ? curr : prev);
        }, allMessages[0]);

        console.warn(`Could not find exact message, using closest match: ${closest.dataset.mid}`);
        closest.classList.add('is-highlighted-by-extension');
        setTimeout(() => closest.classList.remove('is-highlighted-by-extension'), 2500);

        // try immediate extraction
        let mediaItems = extractMediaFromElement(closest);
        if (!mediaItems.length) {
          // try to open/expand the message (best-effort) then wait for media to appear
          try {
            const clickable = closest.querySelector('a, button, .open, .message__bubble') || closest;
            clickable.click && clickable.click();
          } catch (e) { /* ignore */ }

          mediaItems = await waitForMediaInElement(closest, 2500);
        }

        if (mediaItems.length) return mediaItems;
        throw new Error('Could not find media in the closest message.');
      }
      throw new Error('Could not find the specified message in the DOM.');
    }

    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    messageEl.classList.add('is-highlighted-by-extension');

    // wait briefly for lazy-loaded media inside the exact element
    const mediaItems = await waitForMediaInElement(messageEl, 2500);
    if (!mediaItems.length) throw new Error('Could not find media inside the message element.');

    setTimeout(() => messageEl.classList.remove('is-highlighted-by-extension'), 2500);
    return mediaItems;

  } catch (error) {
    console.error('Error fetching message media:', error);
    throw error;
  }
}

async function urlToDataUrl(url) {
    if (!url) return url;
    // If it's already a data URL, return it
    if (url.startsWith('data:')) return url;
    // If it's a blob: URL, fetch and convert
    if (url.startsWith('blob:')) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            throw new Error('Failed to convert blob URL to data URL');
        }
    }
    return url;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  if (message.action === 'fetchMessage') {
    // acknowledge synchronously so sender's channel closes cleanly
    sendResponse && sendResponse({ started: true });
    getMediaFromMessage(message.url)
      .then(media => chrome.runtime.sendMessage({ action: 'messageMediaFound', media }))
      .catch(error => chrome.runtime.sendMessage({ action: 'fetchError', error: error.message || String(error) }));
    // do NOT return true() here
    return;
  }
  
  if (message.action === 'downloadMedia') {
    // acknowledge synchronously so sender's channel closes cleanly
    sendResponse && sendResponse({ started: true });

    const { mediaSrc, mediaType, downloadId } = message || {};

    const sendError = (err) => chrome.runtime.sendMessage({ action: 'downloadError', downloadId, error: String(err) });

    const dispatchDataUrl = (dataUrl) => {
      chrome.runtime.sendMessage({ action: 'dispatchDownload', src: dataUrl, downloadId });
    };

    const tryFetchBlobAsFallback = async (src) => {
      try {
        if (!src) throw new Error('No media src');
        if (src.startsWith('blob:')) {
          const dataUrl = await urlToDataUrl(src);
          dispatchDataUrl(dataUrl);
          return;
        }
        const resp = await fetch(src, { mode: 'cors' });
        if (!resp.ok) throw new Error('fetch failed: ' + resp.status);
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onload = () => dispatchDataUrl(reader.result);
        reader.onerror = () => sendError('Failed to read blob fallback');
        reader.readAsDataURL(blob);
      } catch (e) {
        sendError('Cannot record or fetch this video (CORS/codec). ' + (e && e.message ? e.message : e));
      }
    };

    (async () => {
      try {
        if (mediaType === 'video') {
          const videoEl = Array.from(document.querySelectorAll('video')).find(v => {
            const cs = v.currentSrc || v.src || '';
            return cs && cs === mediaSrc;
          });

          if (!videoEl || typeof videoEl.captureStream !== 'function' || !isFinite(videoEl.duration)) {
            await tryFetchBlobAsFallback(mediaSrc);
            return;
          }

          const stream = videoEl.captureStream();
          const optionsCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
          let recorder = null;
          for (const opt of optionsCandidates) {
            try {
              recorder = new MediaRecorder(stream, { mimeType: opt });
              break;
            } catch (e) {
              recorder = null;
            }
          }
          if (!recorder) {
            await tryFetchBlobAsFallback(mediaSrc);
            return;
          }

          const chunks = [];
          recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
          recorder.onerror = (ev) => { sendError('Recording error: ' + (ev && ev.error ? ev.error.message : ev)); };
          recorder.onstop = () => {
            try {
              const completeBlob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
              const reader = new FileReader();
              reader.onload = () => {
                chrome.runtime.sendMessage({ action: 'dispatchDownload', src: reader.result, downloadId });
              };
              reader.onerror = () => sendError('Failed to read recorded video');
              reader.readAsDataURL(completeBlob);
            } catch (e) {
              sendError(e);
            }
          };

          const originalMutedState = videoEl.muted;
          const originalPlaybackRate = videoEl.playbackRate;
          const originalCurrentTime = videoEl.currentTime;
          try {
            videoEl.muted = true;
            videoEl.currentTime = 0;
            recorder.start(1000);
            await videoEl.play();
          } catch (e) {
            try { if (recorder && recorder.state === 'recording') recorder.stop(); } catch (__) {}
            videoEl.muted = originalMutedState;
            sendError('Playback failed; cannot record video. ' + (e && e.message ? e.message : e));
            return;
          }

          const durationMs = (isFinite(videoEl.duration) ? videoEl.duration * 1000 : 0) || 0;
          const updateInterval = setInterval(() => {
            const percentage = Math.round((videoEl.currentTime / (videoEl.duration || 1)) * 100);
            chrome.runtime.sendMessage({ action: 'downloadProgress', progress: percentage, downloadId });
          }, 500);

          setTimeout(() => {
            try { if (recorder && recorder.state === 'recording') recorder.stop(); } catch (e) {}
            clearInterval(updateInterval);
            videoEl.muted = originalMutedState;
            videoEl.playbackRate = originalPlaybackRate;
            try { videoEl.currentTime = originalCurrentTime; } catch (e) {}
          }, Math.max(durationMs + 500, 5000));

        } else { // photo
          let src = mediaSrc;
          if (!src) throw new Error('No media src');
          if (src.startsWith('blob:')) {
            const dataUrl = await urlToDataUrl(src);
            chrome.runtime.sendMessage({ action: 'dispatchDownload', src: dataUrl, downloadId });
            return;
          }
          const res = await fetch(src, { mode: 'cors' });
          if (!res.ok) throw new Error('fetch failed: ' + res.status);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onload = () => {
            chrome.runtime.sendMessage({ action: 'dispatchDownload', src: reader.result, downloadId });
          };
          reader.onerror = () => sendError('Failed to read photo blob.');
          reader.readAsDataURL(blob);
        }
      } catch (err) {
        sendError(err && err.message ? err.message : err);
      }
    })();

    return;
  }
});

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .is-highlighted-by-extension {
            box-shadow: 0 0 10px 5px #8774e1 !important;
            border: 2px solid #8774e1 !important;
            transition: all 0.5s ease-in-out;
            border-radius: 12px;
        }
    `;
    document.head.appendChild(style);
}

injectStyles();

