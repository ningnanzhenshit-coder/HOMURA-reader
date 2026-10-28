/* ============================================================================
   HOMURA · 双缓冲渲染引擎
   ----------------------------------------------------------------------------
   单页 / 双页的缓冲区 DOM、图片预解码、硬件加速翻页动画与后台预加载。
   ========================================================================== */

import { state, updateToolbarHighlight } from './core.js';
import { escapeHtml } from './bookshelf.js';
import { ensurePageUrlLoaded, decodeImgIntoElement } from './pagination.js';
import { getSpreadPair, isNavigationInverted } from './reader.js';
import { scheduleProgressSave } from './progress.js';


// Generate inner HTML for a single buffer layer (Buffer 0 or Buffer 1)
function createBufferSlotInnerHtml(slotIndex, bookType) {
  if (bookType === 'manga') {
    return `
      <!-- 1P Single Manga Wrapper -->
      <div id="buf-${slotIndex}-manga-1p" class="w-full h-full flex items-center justify-center overflow-hidden">
        <img id="buf-${slotIndex}-img-single" class="manga-page-img h-full w-auto max-w-full object-contain select-none" />
      </div>
      <!-- 2P Double Manga Wrapper -->
      <div id="buf-${slotIndex}-manga-2p" class="w-full h-full hidden items-center justify-center overflow-hidden">
        <div class="flex items-center justify-center w-full h-full relative">
          <div class="w-1/2 h-full flex items-center justify-end overflow-hidden">
            <img id="buf-${slotIndex}-img-left" class="manga-page-img h-full max-h-full w-auto max-w-full object-contain object-right select-none" />
          </div>
          <div class="w-2 h-full book-spine-shadow pointer-events-none z-10 shrink-0"></div>
          <div class="w-1/2 h-full flex items-center justify-start overflow-hidden">
            <img id="buf-${slotIndex}-img-right" class="manga-page-img h-full max-h-full w-auto max-w-full object-contain object-left select-none" />
          </div>
        </div>
      </div>
    `;
  } else {
    const novelCardHtml = (cardId) => `
      <article id="${cardId}" class="flex-1 h-full max-w-2xl bg-[var(--bg-card)] text-[var(--fg-main)] rounded-xl shadow-sm border border-[var(--border-line)] px-6 py-5 sm:px-10 sm:py-7 flex flex-col justify-between overflow-hidden">
        <div class="flex-1 overflow-hidden flex flex-col">
          <div class="flex items-center justify-between border-b border-[var(--border-line)] pb-2.5 mb-4 text-xs font-sans text-[var(--brand-primary)] font-bold shrink-0">
            <span data-role="title" class="truncate">章节</span>
            <span data-role="meta" class="font-mono shrink-0 ml-2">1 / 1</span>
          </div>
          <div data-role="body" class="epub-content font-serif leading-relaxed flex-1 overflow-hidden"></div>
        </div>
        <div data-role="footer" class="pt-3 text-center text-[11px] font-mono text-[var(--fg-muted)] shrink-0">
          — 第 1 页 —
        </div>
      </article>
    `;
    return `
      <!-- 1P Single Novel Wrapper -->
      <div id="buf-${slotIndex}-novel-1p" class="w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        ${novelCardHtml(`buf-${slotIndex}-card-single`)}
      </div>
      <!-- 2P Double Novel Wrapper -->
      <div id="buf-${slotIndex}-novel-2p" class="w-full h-full max-w-6xl mx-auto hidden flex-col md:flex-row items-stretch justify-center gap-3 p-2 sm:p-4 relative z-0 overflow-hidden">
        ${novelCardHtml(`buf-${slotIndex}-card-left`)}
        ${novelCardHtml(`buf-${slotIndex}-card-right`)}
      </div>
    `;
  }
}

function fillNovelCardDOM(cardEl, pageObj, sideLabel, totalPages) {
  if (!cardEl || !pageObj) return;
  cardEl.style.fontSize = state.layoutConfig.fontSize + 'px';
  const titleEl = cardEl.querySelector('[data-role="title"]');
  const metaEl = cardEl.querySelector('[data-role="meta"]');
  const bodyEl = cardEl.querySelector('[data-role="body"]');
  const footEl = cardEl.querySelector('[data-role="footer"]');

  if (titleEl) titleEl.textContent = pageObj.title;
  if (metaEl) metaEl.textContent = `${sideLabel} ${pageObj.pageNumber} / ${totalPages}`;
  if (bodyEl) bodyEl.innerHTML = pageObj.html;
  if (footEl) footEl.textContent = `— 第 ${pageObj.pageNumber} 页 —`;
}

// Populate a target buffer slot (0 or 1) and decode its images BEFORE starting the transition
async function populateBufferSlot(slotIndex, pair, total) {
  if (state.currentBook.type === 'manga') {
    for (const p of pair) {
      await ensurePageUrlLoaded(p.itemRef);
    }
    const wrap1p = document.getElementById(`buf-${slotIndex}-manga-1p`);
    const wrap2p = document.getElementById(`buf-${slotIndex}-manga-2p`);

    if (pair.length === 1) {
      wrap1p.classList.remove('hidden');
      wrap1p.classList.add('flex');
      wrap2p.classList.add('hidden');
      wrap2p.classList.remove('flex');
      const singleImg = document.getElementById(`buf-${slotIndex}-img-single`);
      await decodeImgIntoElement(singleImg, pair[0].itemRef.url);
    } else {
      wrap2p.classList.remove('hidden');
      wrap2p.classList.add('flex');
      wrap1p.classList.add('hidden');
      wrap1p.classList.remove('flex');
      const leftItem = state.layoutConfig.direction === 'rtl' ? pair[1] : pair[0];
      const rightItem = state.layoutConfig.direction === 'rtl' ? pair[0] : pair[1];
      const leftImg = document.getElementById(`buf-${slotIndex}-img-left`);
      const rightImg = document.getElementById(`buf-${slotIndex}-img-right`);
      await Promise.all([
        decodeImgIntoElement(leftImg, leftItem.itemRef.url),
        decodeImgIntoElement(rightImg, rightItem.itemRef.url)
      ]);
    }
  } else {
    const wrap1p = document.getElementById(`buf-${slotIndex}-novel-1p`);
    const wrap2p = document.getElementById(`buf-${slotIndex}-novel-2p`);

    if (pair.length === 1) {
      wrap1p.classList.remove('hidden');
      wrap1p.classList.add('flex');
      wrap2p.classList.add('hidden');
      wrap2p.classList.remove('flex');
      const cardSingle = document.getElementById(`buf-${slotIndex}-card-single`);
      fillNovelCardDOM(cardSingle, pair[0], state.layoutConfig.direction === 'rtl' ? '[右→左]' : '[左→右]', total);
    } else {
      wrap2p.classList.remove('hidden');
      wrap2p.classList.add('flex');
      wrap1p.classList.add('hidden');
      wrap1p.classList.remove('flex');
      const leftItem = state.layoutConfig.direction === 'rtl' ? pair[1] : pair[0];
      const rightItem = state.layoutConfig.direction === 'rtl' ? pair[0] : pair[1];
      const cardLeft = document.getElementById(`buf-${slotIndex}-card-left`);
      const cardRight = document.getElementById(`buf-${slotIndex}-card-right`);
      fillNovelCardDOM(cardLeft, leftItem, state.layoutConfig.direction === 'rtl' ? '左页(后读)' : '左页(先读)', total);
      fillNovelCardDOM(cardRight, rightItem, state.layoutConfig.direction === 'rtl' ? '右页(先读)' : '右页(后读)', total);
    }
  }
}

export async function renderReaderViewport(transitionDir = 'fade') {
  if (!state.currentBook) return;
  const myToken = ++state.renderToken;
  updateToolbarHighlight();

  // Pause any background ZIP preloading while preparing or running page turn animation
  clearTimeout(state.preloadTimer);

  const viewport = document.getElementById('readerViewport');
  const indicator = document.getElementById('pageIndicatorLeft');
  const slider = document.getElementById('readerSlider');
  const total = state.activePages.length;

  slider.max = Math.max(0, total - 1);
  slider.value = state.currentIndex;
  // 所有翻页 / 跳页 / 重排最终都会经过这里，统一防抖记录阅读位置
  scheduleProgressSave();

  // ========================================================================
  // 1. VERTICAL MODE (Webtoon / Continuous Scroll)
  // ========================================================================
  if (state.layoutConfig.direction === 'vertical') {
    if (state.webtoonObserver) {
      state.webtoonObserver.disconnect();
      state.webtoonObserver = null;
    }
    state.currentStageModeKey = 'vertical_' + state.currentBook.id + '_' + state.layoutConfig.webtoonFit;
    indicator.innerText = `${state.currentIndex + 1} / ${total}`;

    if (state.currentBook.type === 'manga') {
      let imgStyleClass = '';
      if (state.layoutConfig.webtoonFit === 'screen') {
        imgStyleClass = 'max-h-[calc(100vh-6rem)] w-auto max-w-full object-contain mx-auto';
      } else if (state.layoutConfig.webtoonFit === 'medium') {
        imgStyleClass = 'w-full max-w-[720px] h-auto object-contain mx-auto';
      } else {
        imgStyleClass = 'w-full max-w-[1024px] h-auto object-contain mx-auto';
      }

      viewport.innerHTML = `
        <div id="verticalScrollContainer" class="w-full h-full overflow-y-auto flex flex-col items-center py-2 gap-2">
          ${state.activePages.map((p, idx) => `
            <div id="webtoon-page-${idx}" class="w-full flex flex-col items-center justify-center shrink-0">
              <img data-lazy-index="${idx}" class="manga-page-img ${imgStyleClass} bg-[var(--bg-card)] shadow-sm rounded-sm select-none" alt="第 ${p.pageNumber} 页" />
            </div>
          `).join('')}
        </div>
      `;
      const scrollRoot = document.getElementById('verticalScrollContainer');

      for (let i = Math.max(0, state.currentIndex - 1); i <= Math.min(total - 1, state.currentIndex + 2); i++) {
        ensurePageUrlLoaded(state.activePages[i].itemRef).then(url => {
          const el = viewport.querySelector(`img[data-lazy-index="${i}"]`);
          if (el && url) el.src = url;
        });
      }

      state.webtoonObserver = new IntersectionObserver(entries => {
        entries.forEach(async entry => {
          if (entry.isIntersecting) {
            const imgEl = entry.target;
            const idx = parseInt(imgEl.getAttribute('data-lazy-index'), 10);
            const pageData = state.activePages[idx];
            if (pageData) {
              const url = await ensurePageUrlLoaded(pageData.itemRef);
              if (url && imgEl.src !== url) imgEl.src = url;
            }
            state.currentIndex = idx;
            indicator.innerText = `${idx + 1} / ${total}`;
            slider.value = idx;
            scheduleProgressSave();
          }
        });
      }, { root: scrollRoot, rootMargin: '800px 0px', threshold: 0.1 });

      viewport.querySelectorAll('img[data-lazy-index]').forEach(img => state.webtoonObserver.observe(img));

      if (state.currentIndex > 0) {
        setTimeout(() => {
          const target = document.getElementById('webtoon-page-' + state.currentIndex);
          if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, 50);
      }
    } else {
      viewport.innerHTML = `
        <div id="verticalScrollContainer" class="w-full h-full overflow-y-auto py-4 px-2">
          <div style="font-size: ${state.layoutConfig.fontSize}px;" class="max-w-3xl mx-auto bg-[var(--bg-card)] rounded-xl shadow-sm border border-[var(--border-line)] p-6 sm:p-12 space-y-8">
            ${state.activePages.map(p => `
              <section id="webtoon-page-${p.pageNumber - 1}" class="border-b border-[var(--border-line)] pb-6 last:border-none">
                <div class="text-xs font-bold text-[var(--brand-primary)] mb-4">${escapeHtml(p.title)} · 第 ${p.pageNumber} 章</div>
                <div class="epub-content font-serif leading-relaxed">${p.html}</div>
              </section>
            `).join('')}
          </div>
        </div>
      `;
    }
    return;
  }

  // ========================================================================
  // 2. DOUBLE-BUFFERED PAGINATED TRACK ENGINE (Zero-Jank Simultaneous Slide)
  // ========================================================================
  if (state.webtoonObserver) {
    state.webtoonObserver.disconnect();
    state.webtoonObserver = null;
  }

  const pair = getSpreadPair(state.currentIndex);
  const pageNums = pair.map(p => p.pageNumber).join('-');
  indicator.innerText = `${pageNums} / ${total}`;

  const inverted = isNavigationInverted();
  const desiredStageKey = `double_buffer_${state.currentBook.type}`;
  const isInitialMount = state.currentStageModeKey !== desiredStageKey;

  if (isInitialMount) {
    state.currentStageModeKey = desiredStageKey;
    state.activeBufferSlot = 0;

    viewport.innerHTML = `
      <!-- Left & Right Click Tap Zones -->
      <div onclick="onLeftButtonClick()" class="fixed inset-y-12 left-0 w-[14%] z-30 cursor-pointer group flex items-center justify-start pl-3" title="点击翻页">
        <div id="tapHintLeft" style="background-color: var(--brand-primary);" class="opacity-0 group-hover:opacity-95 transition text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
          ←
        </div>
      </div>
      <div onclick="onRightButtonClick()" class="fixed inset-y-12 right-0 w-[14%] z-30 cursor-pointer group flex items-center justify-end pr-3" title="点击翻页">
        <div id="tapHintRight" style="background-color: var(--brand-primary);" class="opacity-0 group-hover:opacity-95 transition text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
          →
        </div>
      </div>

      <!-- Hardware-Accelerated Double-Buffer Stage -->
      <div id="doubleBufferTrack" class="relative w-full h-full overflow-hidden">
        <div id="stageBuffer0" class="stage-buffer-layer z-20" style="opacity: 1; transform: translate3d(0,0,0);">
          ${createBufferSlotInnerHtml(0, state.currentBook.type)}
        </div>
        <div id="stageBuffer1" class="stage-buffer-layer z-10 pointer-events-none" style="opacity: 0; transform: translate3d(0,0,0);">
          ${createBufferSlotInnerHtml(1, state.currentBook.type)}
        </div>
      </div>
    `;
  }

  // Update tap zone labels
  const hintL = document.getElementById('tapHintLeft');
  const hintR = document.getElementById('tapHintRight');
  if (hintL) hintL.textContent = inverted ? '← 下一页' : '← 上一页';
  if (hintR) hintR.textContent = inverted ? '上一页 →' : '下一页 →';

  if (isInitialMount) {
    await populateBufferSlot(0, pair, total);
    if (myToken !== state.renderToken) return;
    scheduleIdlePreload();
    return;
  }

  // Prepare the STANDBY buffer off-screen while the current buffer remains 100% stable on screen!
  const prevSlot = state.activeBufferSlot;
  const nextSlot = 1 - state.activeBufferSlot;

  await populateBufferSlot(nextSlot, pair, total);
  if (myToken !== state.renderToken) return;

  // Cancel any ongoing Web Animations cleanly before starting the new transition
  state.activeTransitionAnims.forEach(anim => {
    try { anim.cancel(); } catch (e) {}
  });
  state.activeTransitionAnims = [];

  const outEl = document.getElementById(`stageBuffer${prevSlot}`);
  const inEl = document.getElementById(`stageBuffer${nextSlot}`);
  state.activeBufferSlot = nextSlot;

  inEl.style.zIndex = '20';
  inEl.classList.remove('pointer-events-none');
  outEl.style.zIndex = '10';
  outEl.classList.add('pointer-events-none');

  const styleMode = state.layoutConfig.transitionStyle;

  if (styleMode === 'none' || transitionDir === 'none' || !outEl.animate) {
    inEl.style.opacity = '1';
    inEl.style.transform = 'translate3d(0, 0, 0)';
    outEl.style.opacity = '0';
    outEl.style.transform = 'translate3d(0, 0, 0)';
    scheduleIdlePreload();
    return;
  }

  // Determine smooth GPU keyframes using Web Animations API (runs on compositor thread, never janks!)
  const duration = styleMode === 'slide' ? 260 : 200;
  const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

  let inKeyframes, outKeyframes;
  if (styleMode === 'slide' && (transitionDir === 'enter-from-right' || transitionDir === 'enter-from-left')) {
    const enterOffset = transitionDir === 'enter-from-right' ? '14%' : '-14%';
    const exitOffset = transitionDir === 'enter-from-right' ? '-10%' : '10%';

    inKeyframes = [
      { transform: `translate3d(${enterOffset}, 0, 0) scale(0.992)`, opacity: 0 },
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
    ];
    outKeyframes = [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: `translate3d(${exitOffset}, 0, 0) scale(0.992)`, opacity: 0 }
    ];
  } else {
    inKeyframes = [
      { transform: 'translate3d(0, 0, 0) scale(0.994)', opacity: 0 },
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
    ];
    outKeyframes = [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: 'translate3d(0, 0, 0) scale(0.996)', opacity: 0 }
    ];
  }

  inEl.style.opacity = '1';
  outEl.style.opacity = '0';

  const animIn = inEl.animate(inKeyframes, { duration, easing, fill: 'forwards' });
  const animOut = outEl.animate(outKeyframes, { duration, easing, fill: 'forwards' });
  state.activeTransitionAnims.push(animIn, animOut);

  animIn.onfinish = () => {
    inEl.style.transform = 'translate3d(0, 0, 0)';
    inEl.style.opacity = '1';
    outEl.style.transform = 'translate3d(0, 0, 0)';
    outEl.style.opacity = '0';
    scheduleIdlePreload();
  };
}

// Background Preloader: Only runs AFTER page turn animation completes so animation never drops a frame!
function scheduleIdlePreload() {
  clearTimeout(state.preloadTimer);
  if (!state.currentBook || state.currentBook.type !== 'manga') return;

  state.preloadTimer = setTimeout(async () => {
    for (let i = 1; i <= 4; i++) {
      const nextPage = state.activePages[state.currentIndex + i];
      if (nextPage && nextPage.itemRef && !nextPage.itemRef.url) {
        const url = await ensurePageUrlLoaded(nextPage.itemRef);
        if (url) {
          const img = new Image();
          img.src = url;
          if (img.decode) {
            try { await img.decode(); } catch (e) {}
          }
        }
      }
    }
  }, 280);
}
