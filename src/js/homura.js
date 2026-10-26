    // ============================================================================
    // 1. Core State, Theme Customization & Double-Buffer Smooth Engine
    // ============================================================================
    let library = [];
    let currentBook = null;
    let currentIndex = 0;
    let activePages = [];
    let renderToken = 0;
    let webtoonObserver = null;
    let lastWheelTurnTime = 0;

    // Double-Buffer State for 60fps / 120fps Hardware-Accelerated Page Turning
    let currentStageModeKey = '';
    let activeBufferSlot = 0; // 0 = Buffer A, 1 = Buffer B
    let activeTransitionAnims = [];
    let preloadTimer = null;

    let layoutConfig = {
      direction: 'ltr',          // 'ltr' | 'rtl' | 'vertical'
      spread: 2,                 // 1 | 2
      coverOffset: true,
      fontSize: 18,
      rtlInvertButtons: true,    // 日漫右→左模式下默认「左边是下一页」
      webtoonFit: 'screen',      // 'screen' | 'medium' | 'wide'
      themeColor: 'blue',        // 'blue' | 'red' | 'green' | 'violet'
      surfaceMode: 'light',      // 'light' | 'warm' | 'dark'
      transitionStyle: 'slide'   // 'slide' (丝滑平移) | 'fade' (柔和淡入) | 'none' (极速无动画)
    };

    function showToast(msg) {
      const existing = document.getElementById('hikariToast');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.id = 'hikariToast';
      el.style.backgroundColor = 'var(--brand-primary)';
      el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] text-white px-4 py-2 rounded-xl shadow-xl text-xs font-bold tracking-wide transition-all duration-200 pointer-events-none';
      el.innerText = msg;
      document.body.appendChild(el);
      setTimeout(() => {
        if (el.parentNode) el.remove();
      }, 2200);
    }

    function setThemeColor(colorName, silent = false) {
      layoutConfig.themeColor = colorName;
      document.documentElement.setAttribute('data-theme', colorName);
      try { localStorage.setItem('homura_theme_color', colorName); } catch (e) {}

      document.querySelectorAll('[data-swatch]').forEach(btn => {
        if (btn.getAttribute('data-swatch') === colorName) {
          btn.classList.add('active-swatch');
        } else {
          btn.classList.remove('active-swatch');
        }
      });

      const names = { blue: '晴空蓝', red: '绯红金', green: '森系绿', violet: '星夜紫' };
      if (!silent) showToast(`已切换 UI 主题色：${names[colorName] || colorName}`);
      if (currentBook) updateToolbarHighlight();
    }

    function setSurfaceMode(modeName, silent = false) {
      layoutConfig.surfaceMode = modeName;
      const html = document.documentElement;
      html.setAttribute('data-mode', modeName);
      if (modeName === 'dark') {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
      try { localStorage.setItem('homura_surface_mode', modeName); } catch (e) {}

      document.querySelectorAll('[data-mode-btn]').forEach(btn => {
        const isCurrent = btn.getAttribute('data-mode-btn') === modeName;
        if (isCurrent) {
          btn.style.backgroundColor = 'var(--brand-primary)';
          btn.style.color = '#FFFFFF';
        } else {
          btn.style.backgroundColor = 'transparent';
          btn.style.color = 'var(--fg-muted)';
        }
      });

      const labels = {
        light: '☀️ 白昼清爽模式',
        warm: '🌾 暖色调护眼模式（羊皮纸柔光）',
        dark: '🌙 夜间深邃模式'
      };
      if (!silent) showToast(`已切换：${labels[modeName]}`);
    }

    function toggleTransitionStyle() {
      const order = ['slide', 'fade', 'none'];
      const labels = { slide: '丝滑平移', fade: '柔和淡入', none: '极速无动画' };
      const nextIdx = (order.indexOf(layoutConfig.transitionStyle) + 1) % order.length;
      layoutConfig.transitionStyle = order[nextIdx];
      document.getElementById('transitionStyleStatus').innerText = labels[layoutConfig.transitionStyle];
      showToast('翻页过渡效果：' + labels[layoutConfig.transitionStyle]);
    }

    function toggleFullScreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          showToast('无法进入全屏模式: ' + err.message);
        });
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }

    document.addEventListener('fullscreenchange', () => {
      const isFs = !!document.fullscreenElement;
      const textEl = document.getElementById('fullscreenText');
      if (textEl) textEl.innerText = isFs ? '退出 (F)' : 'F 全屏';
      if (currentBook && currentBook.type !== 'manga') {
        recalculateNovelPaginationAndRender();
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (!currentBook || currentBook.type === 'manga' || layoutConfig.direction === 'vertical') return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        recalculateNovelPaginationAndRender();
      }, 180);
    });

    // ============================================================================
    // 2. Demo Manga & Novel Generators
    // ============================================================================
    function createDemoMangaSvg(pageNumber, title, subtitle) {
      const isRightSide = pageNumber % 2 === 1;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 1200" width="850" height="1200">
        <rect width="850" height="1200" fill="#ffffff"/>
        <rect x="28" y="28" width="794" height="1144" rx="12" fill="#f8fafc" stroke="#0f172a" stroke-width="5"/>
        <rect x="56" y="56" width="738" height="350" rx="8" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>
        <circle cx="${isRightSide ? 600 : 250}" cy="230" r="100" fill="#3b82f6" opacity="0.22"/>
        <text x="425" y="220" font-family="sans-serif" font-size="40" font-weight="900" fill="#0f172a" text-anchor="middle">${title}</text>
        <text x="425" y="275" font-family="sans-serif" font-size="20" font-weight="700" fill="#2563eb" text-anchor="middle">${subtitle}</text>
        <rect x="56" y="436" width="354" height="380" rx="8" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <text x="233" y="630" font-family="sans-serif" font-size="24" font-weight="800" fill="#1e293b" text-anchor="middle">分镜 A (左格)</text>
        <rect x="440" y="436" width="354" height="380" rx="8" fill="#dbeafe" stroke="#0f172a" stroke-width="3"/>
        <text x="617" y="630" font-family="sans-serif" font-size="24" font-weight="800" fill="#1e293b" text-anchor="middle">分镜 B (右格)</text>
        <rect x="56" y="846" width="738" height="280" rx="8" fill="#0f172a"/>
        <text x="425" y="975" font-family="sans-serif" font-size="50" font-weight="900" fill="#ffffff" text-anchor="middle">PAGE 0${pageNumber}</text>
        <text x="425" y="1035" font-family="sans-serif" font-size="18" font-weight="700" fill="#60a5fa" text-anchor="middle">双缓冲滑轨过渡 · 零卡顿硬件加速 · 暖色护眼 · 鼠标滚轮</text>
      </svg>`;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    function loadDemoManga(openNow = false) {
      const pages = [
        createDemoMangaSvg(1, '第1页 · 封面 (Cover)', '双页模式下首页单独对齐'),
        createDemoMangaSvg(2, '第2页 · 苍穹启航', '日漫模式下位于右侧先读'),
        createDemoMangaSvg(3, '第3页 · 星轨观测', '日漫模式下位于左侧后读（左边是下一页）'),
        createDemoMangaSvg(4, '第4页 · 跨页展开 (右)', '双缓冲滑轨：旧页滑出 + 新页同步滑入'),
        createDemoMangaSvg(5, '第5页 · 跨页展开 (左)', '支持鼠标滚轮直接丝滑翻页'),
        createDemoMangaSvg(6, '第6页 · 终章预告', '条漫模式支持单张完整显示')
      ];
      const book = {
        id: 'demo_manga_' + Date.now(),
        type: 'manga',
        title: 'Homura 苍穹航路分镜集',
        cover: pages[0],
        pageItems: pages.map(url => ({ url })),
        pageCount: pages.length
      };
      library.unshift(book);
      renderBookshelf();
      if (openNow) openBook(book.id);
      else showToast('已添加《示例漫画》到书架');
    }

    function loadDemoNovel(openNow = false) {
      const chapters = [
        {
          title: '序章 双缓冲丝滑翻页与智能分页',
          htmlContent: `
            <p>深夜的第七观测塔顶层，空气中弥漫着清凉的夜风与古老星盘运转的微响。</p>
            <p>「现在的翻页采用了真正的双缓冲滑轨架构（Double-Buffered Track Engine）。」少年合上怀表，微笑着指向眼前的纸页，「当您点击下一页或滚动鼠标滚轮时，旧的一页会优雅地向旁滑出，同时新的一页从另一侧无缝滑入，就像在平板电脑上翻阅实体书一样自然。」</p>
            <p>为了彻底消除任何细微卡顿，在 260 毫秒的翻页动画播放期间，后台会自动暂停一切压缩包解压任务，将浏览器 100% 的 GPU 算力全部用于渲染丝滑帧率；等动画落定后，再静默为您预解码后面 4 页的内容。</p>
            <p>无论您导入的 .epub 或 .txt 一章有五千字还是一万字，智能屏幕分页器都会根据当前窗口高度与字号，自动把长章节精准切分成刚好装满一屏的独立书页，再也不会在卡片内部出现纵向滚动条。</p>
            <p>您还可以在顶部右上角点击「过渡：丝滑平移 / 柔和淡入 / 极速无动画」，随时选择最适合自己阅读节奏的过渡效果。</p>
          `
        },
        {
          title: '第一章 星海坠落与观测者之夜',
          htmlContent: `
            <p>警报是在指针指向凌晨三点整时拉响的。蔚蓝色的魔导回路瞬间点亮了整座天球学园的外墙。</p>
            <p>银白色的长发如瀑布般散开，伴随着无数闪烁的星砂，少女自夜空之中直坠而下，落在了观测台中央。</p>
            <p>「终于找到你了，第七观测者。」少女抬起澄澈的眼眸，向他伸出右手。</p>
            <p>您可以随时在顶部切换「☀️白昼 / 🌾护眼 / 🌙夜间」三种环境模式，以及四款不同的主题配色。按下键盘上的 F 键，即可一键进入全屏沉浸阅读。</p>
          `
        }
      ];
      const book = {
        id: 'demo_novel_' + Date.now(),
        type: 'epub',
        title: '星降之夜的观测者 (轻小说)',
        cover: null,
        chapters: chapters,
        pageCount: chapters.length
      };
      library.unshift(book);
      renderBookshelf();
      if (openNow) openBook(book.id);
      else showToast('已添加《示例轻小说》到书架');
    }

    // ============================================================================
    // 3. Bookshelf Rendering & Management
    // ============================================================================
    function renderBookshelf() {
      const grid = document.getElementById('bookshelfGrid');
      const countEl = document.getElementById('shelfCount');
      if (!grid) return;

      countEl.innerText = `${library.length} 本作品`;

      if (library.length === 0) {
        grid.innerHTML = `
          <div class="col-span-full py-14 text-center text-[var(--fg-muted)] text-xs font-medium">
            书架暂无作品，请拖入文件或点击上方「导入文件 / 导入文件夹」
          </div>
        `;
        return;
      }

      grid.innerHTML = library.map(book => {
        const badgeText = book.type === 'manga' ? '漫画' : (book.type === 'epub' ? 'EPUB' : '小说');
        const subInfo = book.type === 'manga'
          ? `共 ${book.pageCount || (book.pageItems ? book.pageItems.length : 0)} 页`
          : `共 ${book.pageCount || (book.chapters ? book.chapters.length : 1)} 章`;

        const coverHtml = book.cover
          ? `<img src="${book.cover}" class="manga-page-img w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" />`
          : `<div style="background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover));" class="w-full h-full p-4 flex flex-col justify-between text-white">
              <span class="text-[10px] font-mono font-bold tracking-widest opacity-80">ACGN·GO</span>
              <div class="font-display font-bold text-sm line-clamp-3 leading-snug text-white">${escapeHtml(book.title)}</div>
              <span class="text-[10px] opacity-80 font-mono">${subInfo}</span>
            </div>`;

        return `
          <div onclick="openBook('${book.id}')" class="editorial-card group cursor-pointer overflow-hidden flex flex-col">
            <div class="aspect-[3/4] w-full bg-[var(--bg-subtle)] relative overflow-hidden border-b border-[var(--border-line)]">
              ${coverHtml}
              <span style="background-color: var(--brand-primary);" class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold text-white shadow">
                ${badgeText}
              </span>
              <button onclick="removeBook('${book.id}', event)" class="absolute top-2.5 right-2.5 w-6 h-6 rounded-md bg-slate-900/75 hover:bg-red-600 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition" title="从书架移除">
                ✕
              </button>
            </div>
            <div class="p-3 flex-1 flex flex-col justify-between gap-1.5">
              <h4 class="font-bold text-xs line-clamp-2 leading-snug group-hover:text-[var(--brand-primary)] transition">
                ${escapeHtml(book.title)}
              </h4>
              <div class="flex items-center justify-between text-[11px] font-mono text-[var(--fg-muted)] pt-1">
                <span>${subInfo}</span>
                <span class="text-[var(--brand-primary)] font-bold">阅读 →</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
    }

    function removeBook(id, ev) {
      if (ev) ev.stopPropagation();
      library = library.filter(b => b.id !== id);
      renderBookshelf();
      HomuraStore.deleteBook(id).catch(() => {});
      showToast('已从书架移除该作品');
    }

    function clearShelf() {
      library = [];
      renderBookshelf();
      HomuraStore.clear().catch(() => {});
      showToast('已清空书架');
    }

    // ============================================================================
    // 4. Zero-Lag Lazy File & Folder Import Engine
    // ============================================================================
    document.getElementById('globalFileInput').addEventListener('change', async e => {
      await handleFiles(e.target.files);
      e.target.value = '';
    });
    document.getElementById('folderFileInput').addEventListener('change', async e => {
      await handleFiles(e.target.files);
      e.target.value = '';
    });

    window.addEventListener('dragover', e => {
      e.preventDefault();
      document.getElementById('dropZoneBanner')?.classList.add('!border-[var(--brand-primary)]');
    });
    window.addEventListener('dragleave', e => {
      e.preventDefault();
      document.getElementById('dropZoneBanner')?.classList.remove('!border-[var(--brand-primary)]');
    });
    window.addEventListener('drop', async e => {
      e.preventDefault();
      document.getElementById('dropZoneBanner')?.classList.remove('!border-[var(--brand-primary)]');

      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const collectedFiles = [];
        const entries = [];
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
            if (entry) entries.push(entry);
            else {
              const f = item.getAsFile();
              if (f) collectedFiles.push(f);
            }
          }
        }
        if (entries.length > 0) {
          showToast('正在扫描文件夹内容...');
          for (const entry of entries) {
            await traverseFileTree(entry, '', collectedFiles);
          }
          if (collectedFiles.length > 0) {
            await handleFiles(collectedFiles);
            return;
          }
        }
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await handleFiles(e.dataTransfer.files);
      }
    });

    function traverseFileTree(item, path, outList) {
      return new Promise(resolve => {
        if (item.isFile) {
          item.file(file => {
            try {
              Object.defineProperty(file, 'customRelativePath', {
                value: path + file.name,
                writable: false
              });
            } catch (err) {}
            outList.push(file);
            resolve();
          }, () => resolve());
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          const readEntriesBatch = () => {
            dirReader.readEntries(async entries => {
              if (!entries || entries.length === 0) {
                resolve();
              } else {
                for (const entry of entries) {
                  await traverseFileTree(entry, path + item.name + '/', outList);
                }
                readEntriesBatch();
              }
            }, () => resolve());
          };
          readEntriesBatch();
        } else {
          resolve();
        }
      });
    }

    async function handleFiles(fileList) {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList).filter(f => !f.name.startsWith('.'));
      if (files.length === 0) return;

      let importedCount = 0;
      const persistTasks = [];
      const addBook = (book, source) => {
        library.unshift(book);
        importedCount++;
        persistTasks.push(persistBook(book, source));
      };

      const epubFiles = files.filter(f => /\.epub$/i.test(f.name));
      for (const epubFile of epubFiles) {
        const book = await parseEpubFileLazy(epubFile);
        if (book) addBook(book, makeFileSource(epubFile));
      }

      const archiveFiles = files.filter(f => /\.(cbz|zip)$/i.test(f.name));
      for (const archiveFile of archiveFiles) {
        const book = await parseCbzFileLazy(archiveFile);
        if (book) addBook(book, makeFileSource(archiveFile));
      }

      const txtFiles = files.filter(f => /\.(txt|md)$/i.test(f.name));
      for (const txtFile of txtFiles) {
        const book = await parseTxtFile(txtFile);
        if (book) addBook(book, makeFileSource(txtFile));
      }

      const imgFiles = files.filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(f.name));
      for (const group of buildImageFolderBooks(imgFiles)) {
        addBook(group.book, makeFolderSource(group.folderName, group.files));
      }

      // 先确保写盘完成，避免导入后立刻关闭页面导致存档丢失
      await Promise.allSettled(persistTasks);

      if (importedCount > 0) {
        renderBookshelf();
        showToast(`✅ 已秒速添加 ${importedCount} 部作品到书架`);
      } else {
        showToast('未找到支持的漫画或小说格式 (.epub / .cbz / .zip / .txt / 图片)');
      }
    }

    // 把散装图片按所在文件夹分组，每组生成一本书
    function buildImageFolderBooks(imgFiles) {
      if (!imgFiles || imgFiles.length === 0) return [];
      const folderGroups = {};
      imgFiles.forEach(f => {
        const rel = f.customRelativePath || f.webkitRelativePath || '';
        const parts = rel.split('/').filter(Boolean);
        let groupName = '本地漫画图集';
        if (parts.length >= 2) {
          groupName = parts[parts.length - 2];
        } else if (imgFiles.length === 1) {
          groupName = f.name.replace(/\.[^.]+$/, '');
        }
        if (!folderGroups[groupName]) folderGroups[groupName] = [];
        folderGroups[groupName].push(f);
      });

      return Object.entries(folderGroups).map(([folderName, groupImgs]) => {
        groupImgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        const firstCoverUrl = URL.createObjectURL(groupImgs[0]);
        const pageItems = groupImgs.map((fileObj, idx) => ({
          file: fileObj,
          url: idx === 0 ? firstCoverUrl : null
        }));
        return {
          folderName,
          files: groupImgs,
          book: {
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            type: 'manga',
            title: folderName,
            cover: firstCoverUrl,
            coverBlob: groupImgs[0],
            pageItems: pageItems,
            pageCount: pageItems.length
          }
        };
      });
    }

    // ==========================================================================
    // 4b. 书架本地存档：IndexedDB 元数据 + 原始文件（优先 File System Access 句柄）
    // ==========================================================================
    let storageNoticeShown = false;

    function makeFileSource(file) {
      const source = { kind: 'file', name: file.name, lastModified: file.lastModified || Date.now() };
      if (file.customHandle) source.handle = file.customHandle;
      else source.blob = file;
      return source;
    }

    function makeFolderSource(folderName, files) {
      return {
        kind: 'folder',
        name: folderName,
        entries: files.map(f => ({
          path: f.customRelativePath || f.webkitRelativePath || (folderName + '/' + f.name),
          lastModified: f.lastModified || Date.now(),
          blob: f
        }))
      };
    }

    async function persistBook(book, source) {
      const meta = {
        id: book.id,
        type: book.type,
        title: book.title,
        pageCount: book.pageCount,
        addedAt: Date.now(),
        coverBlob: book.coverBlob || null
      };
      try {
        await HomuraStore.saveBook(meta, Object.assign({ id: book.id }, source));
        HomuraStore.requestPersistence();
      } catch (err) {
        if (!storageNoticeShown) {
          storageNoticeShown = true;
          showToast('⚠️ 本地存档不可用，请通过 http://localhost 打开页面');
        }
      }
    }

    async function restoreLibrary() {
      let metas = [];
      try {
        metas = await HomuraStore.listBooks();
      } catch (err) {
        return false;
      }
      metas.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      library = metas.map(meta => ({
        id: meta.id,
        type: meta.type,
        title: meta.title,
        pageCount: meta.pageCount,
        cover: meta.coverBlob ? URL.createObjectURL(meta.coverBlob) : null,
        restored: true
      }));
      return metas.length > 0;
    }

    async function ensureReadPermission(handle) {
      try {
        const opts = { mode: 'read' };
        if (await handle.queryPermission(opts) === 'granted') return true;
        if (await handle.requestPermission(opts) === 'granted') return true;
      } catch (err) {}
      return false;
    }

    async function resolveSourceFile(source) {
      if (source.handle) {
        if (!(await ensureReadPermission(source.handle))) return null;
        try {
          return await source.handle.getFile();
        } catch (err) {
          return null;
        }
      }
      if (source.blob) {
        return new File([source.blob], source.name || 'book', { lastModified: source.lastModified || Date.now() });
      }
      return null;
    }

    function parseStoredFile(file) {
      if (/\.epub$/i.test(file.name)) return parseEpubFileLazy(file);
      if (/\.(cbz|zip)$/i.test(file.name)) return parseCbzFileLazy(file);
      if (/\.(txt|md)$/i.test(file.name)) return parseTxtFile(file);
      return null;
    }

    async function resolveFolderFiles(source) {
      const files = [];
      for (const entry of source.entries || []) {
        let file = null;
        if (entry.handle) {
          if (!(await ensureReadPermission(entry.handle))) continue;
          try {
            file = await entry.handle.getFile();
          } catch (err) {
            continue;
          }
        } else if (entry.blob) {
          file = new File([entry.blob], entry.path.split('/').pop(), { lastModified: entry.lastModified || Date.now() });
        }
        if (!file) continue;
        try {
          Object.defineProperty(file, 'customRelativePath', { value: entry.path, writable: false });
        } catch (err) {}
        files.push(file);
      }
      return files;
    }

    // 书架里只有元数据；第一次点开时才回到存档里取原始文件重新解析
    async function hydrateBook(book) {
      let source = null;
      try {
        source = await HomuraStore.getSource(book.id);
      } catch (err) {}
      if (!source) {
        showToast('本地存档已丢失，请重新导入该作品');
        return false;
      }

      showToast(`正在从本地存档恢复《${book.title}》...`);
      let parsed = null;
      if (source.kind === 'folder') {
        const files = await resolveFolderFiles(source);
        if (files.length === 0) {
          showToast('原文件夹已移动或被删除，请重新导入');
          return false;
        }
        const groups = buildImageFolderBooks(files);
        parsed = groups.length > 0 ? groups[0].book : null;
      } else {
        const file = await resolveSourceFile(source);
        if (!file) {
          showToast('原文件已移动或被删除，请重新导入');
          return false;
        }
        parsed = await parseStoredFile(file);
      }

      if (!parsed) return false;
      book.type = parsed.type;
      book.pageCount = parsed.pageCount;
      book.pageItems = parsed.pageItems;
      book.zipContent = parsed.zipContent;
      book.chapters = parsed.chapters;
      book.cover = parsed.cover || book.cover;
      book.coverBlob = parsed.coverBlob;
      book.restored = false;
      return true;
    }

    // File System Access API：优先直接引用原文件（不占浏览器配额），不支持时走普通 input
    document.getElementById('pickFileLabel')?.addEventListener('click', async e => {
      if (!window.showOpenFilePicker) return;
      e.preventDefault();
      let handles = [];
      try {
        handles = await window.showOpenFilePicker({ multiple: true });
      } catch (err) {
        return;
      }
      const files = [];
      for (const handle of handles) {
        try {
          const file = await handle.getFile();
          Object.defineProperty(file, 'customHandle', { value: handle, writable: false });
          files.push(file);
        } catch (err) {}
      }
      if (files.length > 0) await handleFiles(files);
    });

    document.getElementById('pickFolderLabel')?.addEventListener('click', async e => {
      if (!window.showDirectoryPicker) return;
      e.preventDefault();
      let dirHandle = null;
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      } catch (err) {
        return;
      }
      const files = [];
      await collectFilesFromDirHandle(dirHandle, dirHandle.name + '/', files);
      if (files.length > 0) await handleFiles(files);
      else showToast('该文件夹内没有可导入的文件');
    });

    async function collectFilesFromDirHandle(dirHandle, path, out) {
      for await (const [name, entry] of dirHandle.entries()) {
        if (name.startsWith('.')) continue;
        if (entry.kind === 'file') {
          try {
            const file = await entry.getFile();
            Object.defineProperty(file, 'customRelativePath', { value: path + name, writable: false });
            out.push(file);
          } catch (err) {}
        } else if (entry.kind === 'directory') {
          await collectFilesFromDirHandle(entry, path + name + '/', out);
        }
      }
    }

    function resolveRelativePath(basePath, relativePath) {
      const baseDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/') + 1) : '';
      const stack = baseDir.split('/').filter(Boolean);
      const parts = relativePath.split('/');
      for (const p of parts) {
        if (p === '..') stack.pop();
        else if (p !== '.' && p !== '') stack.push(p);
      }
      return stack.join('/');
    }

    async function parseEpubFileLazy(file) {
      try {
        showToast(`正在快速索引《${file.name}》...`);
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        const containerFile = zipContent.file('META-INF/container.xml');
        if (!containerFile) throw new Error('缺少 META-INF/container.xml');
        const containerXml = await containerFile.async('text');
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, 'text/xml');
        const rootfileEl = containerDoc.querySelector('rootfile');
        const opfPath = rootfileEl ? rootfileEl.getAttribute('full-path') : 'content.opf';
        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

        const opfFile = zipContent.file(opfPath);
        if (!opfFile) throw new Error('未找到 OPF 配置文件');
        const opfText = await opfFile.async('text');
        const opfDoc = parser.parseFromString(opfText, 'text/xml');

        const titleEl = opfDoc.querySelector('title, dc\\:title');
        const bookTitle = titleEl ? titleEl.textContent.trim() : file.name.replace(/(\.kepub)?\.epub$/i, '');

        const manifest = {};
        opfDoc.querySelectorAll('manifest > item').forEach(item => {
          manifest[item.getAttribute('id')] = {
            href: item.getAttribute('href'),
            mediaType: item.getAttribute('media-type') || ''
          };
        });

        const spineIds = [];
        opfDoc.querySelectorAll('spine > itemref').forEach(ref => {
          spineIds.push(ref.getAttribute('idref'));
        });

        const lazyMangaEntries = [];
        const seenGlobalPaths = new Set();
        const chapters = [];
        let imageHeavyCount = 0;

        for (const idref of spineIds) {
          const item = manifest[idref];
          if (!item) continue;
          const fullPath = opfDir + decodeURIComponent(item.href);
          const entry = zipContent.file(fullPath) || zipContent.file(item.href);
          if (!entry) continue;

          const rawHtml = await entry.async('text');
          const htmlDoc = parser.parseFromString(rawHtml, 'text/html');
          const imgs = htmlDoc.querySelectorAll('img, image');
          const foundEntriesInPage = [];
          const seenInCurrentPage = new Set();

          for (const img of imgs) {
            const srcAttr = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href');
            if (srcAttr && !srcAttr.startsWith('http') && !srcAttr.startsWith('data:')) {
              const cleanSrc = decodeURIComponent(srcAttr.split('#')[0]);
              const resolved = resolveRelativePath(fullPath, cleanSrc);
              const imgEntry = zipContent.file(resolved) || zipContent.file(cleanSrc);
              if (imgEntry) {
                img.setAttribute('data-zip-path', imgEntry.name);
                if (!seenInCurrentPage.has(imgEntry.name)) {
                  seenInCurrentPage.add(imgEntry.name);
                  foundEntriesInPage.push(imgEntry);
                }
              }
            }
          }

          const plainText = (htmlDoc.body?.textContent || '').trim();
          if (foundEntriesInPage.length > 0 && plainText.length < 60) {
            imageHeavyCount++;
            foundEntriesInPage.forEach(ent => {
              if (!seenGlobalPaths.has(ent.name)) {
                seenGlobalPaths.add(ent.name);
                lazyMangaEntries.push({ zipEntry: ent, url: null });
              }
            });
          }

          const chapterHeading = htmlDoc.querySelector('h1, h2, h3, title')?.textContent?.trim()
            || item.href.split('/').pop().replace(/\.[^.]+$/, '');
          const bodyHtml = htmlDoc.body ? htmlDoc.body.innerHTML.trim() : rawHtml;

          if (bodyHtml.length > 0) {
            chapters.push({
              title: chapterHeading,
              htmlContent: bodyHtml
            });
          }
        }

        const isMangaEpub = imageHeavyCount > 0 && (imageHeavyCount >= chapters.length * 0.45 || lazyMangaEntries.length >= 6);

        if (isMangaEpub && lazyMangaEntries.length > 0) {
          const firstBlob = await lazyMangaEntries[0].zipEntry.async('blob');
          const coverUrl = URL.createObjectURL(firstBlob);
          lazyMangaEntries[0].url = coverUrl;

          return {
            id: 'epub_manga_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'manga',
            title: bookTitle,
            cover: coverUrl,
            coverBlob: firstBlob,
            pageItems: lazyMangaEntries,
            pageCount: lazyMangaEntries.length
          };
        }

        if (chapters.length === 0) throw new Error('未能提取出有效章节内容');

        let coverUrl = null;
        let coverBlob = null;
        if (lazyMangaEntries.length > 0) {
          coverBlob = await lazyMangaEntries[0].zipEntry.async('blob');
          coverUrl = URL.createObjectURL(coverBlob);
        }

        return {
          id: 'epub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          type: 'epub',
          title: bookTitle,
          cover: coverUrl,
          coverBlob: coverBlob,
          zipContent: zipContent,
          chapters: chapters,
          pageCount: chapters.length
        };
      } catch (err) {
        console.error(err);
        showToast('EPUB 解析失败：' + err.message);
        return null;
      }
    }

    async function parseCbzFileLazy(file) {
      try {
        showToast(`正在快速索引压缩包《${file.name}》...`);
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);
        const imgEntries = [];

        zipContent.forEach((relPath, entry) => {
          if (!entry.dir && /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(relPath) && !relPath.includes('__MACOSX')) {
            imgEntries.push({ name: relPath, entry });
          }
        });

        imgEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        if (imgEntries.length === 0) throw new Error('压缩包内未找到图片');

        const firstBlob = await imgEntries[0].entry.async('blob');
        const firstUrl = URL.createObjectURL(firstBlob);

        const pageItems = imgEntries.map((item, idx) => ({
          zipEntry: item.entry,
          url: idx === 0 ? firstUrl : null
        }));

        const title = file.name.replace(/\.(cbz|zip)$/i, '');
        return {
          id: 'cbz_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          type: 'manga',
          title: title,
          cover: firstUrl,
          coverBlob: firstBlob,
          pageItems: pageItems,
          pageCount: pageItems.length
        };
      } catch (err) {
        console.error(err);
        showToast('压缩包解析失败：' + err.message);
        return null;
      }
    }

    function parseTxtFile(txtFile) {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
          const rawText = e.target.result || '';
          const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const title = txtFile.name.replace(/\.[^.]+$/, '');
          
          const chapters = [];
          let currentChapTitle = title + ' · 开始';
          let currentParagraphs = [];
          const chapterRegex = /^(第[0-9零一二三四五六七八九十百千万]+[章节卷回话]|Chapter\s*\d+|序[章言]?|楔子|终章|尾声)/i;

          for (const line of lines) {
            if (line.length < 40 && chapterRegex.test(line)) {
              if (currentParagraphs.length > 0) {
                chapters.push({
                  title: currentChapTitle,
                  htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')
                });
                currentParagraphs = [];
              }
              currentChapTitle = line;
            } else {
              currentParagraphs.push(line);
              if (currentParagraphs.length >= 60) {
                chapters.push({
                  title: currentChapTitle,
                  htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')
                });
                currentParagraphs = [];
              }
            }
          }
          if (currentParagraphs.length > 0) {
            chapters.push({
              title: currentChapTitle,
              htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')
            });
          }
          if (chapters.length === 0) {
            chapters.push({ title, htmlContent: '<p>（空文件）</p>' });
          }

          resolve({
            id: 'txt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'novel',
            title: title,
            cover: null,
            coverBlob: null,
            chapters: chapters,
            pageCount: chapters.length
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(txtFile, 'utf-8');
      });
    }

    // ============================================================================
    // 5. On-Demand Page URL Resolver & GPU Bitmap Pre-Decoder
    // ============================================================================
    async function ensurePageUrlLoaded(pageObj) {
      if (!pageObj) return '';
      if (pageObj.url) return pageObj.url;
      if (pageObj.file) {
        pageObj.url = URL.createObjectURL(pageObj.file);
        return pageObj.url;
      }
      if (pageObj.zipEntry) {
        const blob = await pageObj.zipEntry.async('blob');
        pageObj.url = URL.createObjectURL(blob);
        return pageObj.url;
      }
      return '';
    }

    async function decodeImgIntoElement(imgEl, url) {
      if (!imgEl) return;
      if (!url) {
        imgEl.removeAttribute('src');
        imgEl.setAttribute('data-current-src', '');
        return;
      }
      if (imgEl.getAttribute('data-current-src') === url) return;
      imgEl.src = url;
      imgEl.setAttribute('data-current-src', url);
      if (imgEl.decode) {
        try {
          await imgEl.decode();
        } catch (e) {}
      }
    }

    async function ensureChapterImagesResolved(chap, book) {
      if (!chap || chap.imagesResolved || !book.zipContent) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = chap.htmlContent;
      const pendingImgs = wrapper.querySelectorAll('[data-zip-path]');
      for (const img of pendingImgs) {
        const zipPath = img.getAttribute('data-zip-path');
        const entry = book.zipContent.file(zipPath);
        if (entry) {
          const blob = await entry.async('blob');
          const url = URL.createObjectURL(blob);
          if (img.tagName.toLowerCase() === 'image') {
            img.setAttribute('href', url);
            img.setAttribute('xlink:href', url);
          } else {
            img.setAttribute('src', url);
          }
          img.removeAttribute('data-zip-path');
        }
      }
      chap.htmlContent = wrapper.innerHTML;
      chap.imagesResolved = true;
    }

    // ============================================================================
    // 6. Smart Screen-Fit Novel Paginator (Zero Vertical Overflow)
    // ============================================================================
    function buildActivePagesForBook(book) {
      if (book.type === 'manga') {
        activePages = (book.pageItems || []).map((item, idx) => ({
          pageNumber: idx + 1,
          itemRef: item
        }));
        return;
      }

      if (layoutConfig.direction === 'vertical') {
        activePages = (book.chapters || []).map((chap, idx) => ({
          pageNumber: idx + 1,
          title: chap.title || `第 ${idx + 1} 节`,
          html: chap.htmlContent,
          chapterIndex: idx
        }));
        return;
      }

      const measurer = document.getElementById('novelPaginationMeasurer');
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;

      const isDouble = layoutConfig.spread === 2 && vw >= 768;
      const cardOuterWidth = isDouble
        ? Math.min(540, Math.floor((vw - 64) / 2))
        : Math.min(672, vw - 32);
      const cardHorizontalPadding = vw >= 640 ? 80 : 48;
      const contentWidth = Math.max(220, cardOuterWidth - cardHorizontalPadding);
      const availableTextHeight = Math.max(180, vh - 92 - 175);

      measurer.style.width = contentWidth + 'px';
      measurer.style.fontSize = layoutConfig.fontSize + 'px';
      measurer.innerHTML = '';

      const paginatedList = [];
      const chapters = book.chapters || [];

      for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
        const chap = chapters[cIdx];
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = chap.htmlContent || '';

        const blocks = [];
        Array.from(tempContainer.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            const txt = node.textContent.trim();
            if (txt) blocks.push({ type: 'p', text: txt, html: `<p>${escapeHtml(txt)}</p>` });
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            if (['div', 'section', 'article', 'body'].includes(tag) && node.children.length > 0 && !node.querySelector('img, svg, image')) {
              Array.from(node.children).forEach(child => {
                blocks.push({ type: child.tagName.toLowerCase(), text: child.textContent.trim(), html: child.outerHTML });
              });
            } else {
              blocks.push({ type: tag, text: node.textContent.trim(), html: node.outerHTML });
            }
          }
        });

        if (blocks.length === 0) {
          paginatedList.push({
            title: chap.title || `第 ${cIdx + 1} 章`,
            html: '<p>（本章无正文内容）</p>',
            chapterIndex: cIdx
          });
          continue;
        }

        let currentPageHtml = '';
        measurer.innerHTML = '';

        const flushCurrentPage = () => {
          if (currentPageHtml.trim()) {
            paginatedList.push({
              title: chap.title || `第 ${cIdx + 1} 章`,
              html: currentPageHtml,
              chapterIndex: cIdx
            });
            currentPageHtml = '';
            measurer.innerHTML = '';
          }
        };

        for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
          const blk = blocks[bIdx];
          const prevHtml = currentPageHtml;
          const candidateHtml = prevHtml + blk.html;
          measurer.innerHTML = candidateHtml;

          if (measurer.scrollHeight <= availableTextHeight) {
            currentPageHtml = candidateHtml;
          } else {
            if (!prevHtml && blk.text.length > 80 && !blk.html.includes('<img')) {
              const sentences = blk.text.match(/[^。！？!?]+[。！？!?”]*/g) || [blk.text];
              let subParaText = '';
              for (const sent of sentences) {
                const testPara = `<p>${escapeHtml(subParaText + sent)}</p>`;
                measurer.innerHTML = currentPageHtml + testPara;
                if (measurer.scrollHeight <= availableTextHeight) {
                  subParaText += sent;
                } else {
                  if (subParaText) {
                    currentPageHtml += `<p>${escapeHtml(subParaText)}</p>`;
                    flushCurrentPage();
                    subParaText = sent;
                  } else {
                    currentPageHtml += testPara;
                    flushCurrentPage();
                    subParaText = '';
                  }
                }
              }
              if (subParaText) {
                currentPageHtml += `<p>${escapeHtml(subParaText)}</p>`;
                measurer.innerHTML = currentPageHtml;
              }
            } else {
              if (prevHtml) {
                flushCurrentPage();
              }
              currentPageHtml = blk.html;
              measurer.innerHTML = currentPageHtml;
              if (measurer.scrollHeight > availableTextHeight) {
                flushCurrentPage();
              }
            }
          }
        }
        flushCurrentPage();
      }

      measurer.innerHTML = '';
      activePages = paginatedList.map((item, idx) => ({
        pageNumber: idx + 1,
        title: item.title,
        html: item.html,
        chapterIndex: item.chapterIndex
      }));
    }

    async function recalculateNovelPaginationAndRender() {
      if (!currentBook || currentBook.type === 'manga') return;
      const oldTotal = Math.max(1, activePages.length);
      const progressRatio = currentIndex / oldTotal;

      if (currentBook.zipContent && currentBook.chapters) {
        for (const chap of currentBook.chapters) {
          await ensureChapterImagesResolved(chap, currentBook);
        }
      }

      buildActivePagesForBook(currentBook);
      currentIndex = Math.min(activePages.length - 1, Math.max(0, Math.round(progressRatio * activePages.length)));
      currentStageModeKey = '';
      renderReaderViewport('none');
    }

    // ============================================================================
    // 7. Double-Buffered Hardware-Accelerated Page Transition Engine
    // ============================================================================
    async function openBook(id) {
      const book = library.find(b => b.id === id);
      if (!book) return;

      // 从本地存档恢复的书只有元数据，第一次点开时才去取源文件
      if (book.restored) {
        const ok = await hydrateBook(book);
        if (!ok) return;
        renderBookshelf();
      }

      currentBook = book;
      currentIndex = 0;
      currentStageModeKey = '';
      activeBufferSlot = 0;

      document.getElementById('readerTitle').innerText = book.title;
      document.getElementById('readerModal').classList.remove('hidden');

      const fontCtrl = document.getElementById('novelFontControls');
      if (book.type === 'manga') {
        fontCtrl.classList.add('hidden');
        fontCtrl.classList.remove('sm:flex');
        buildActivePagesForBook(book);
        renderReaderViewport('none');
      } else {
        fontCtrl.classList.remove('hidden');
        fontCtrl.classList.add('sm:flex');
        if (book.zipContent && book.chapters) {
          for (const chap of book.chapters) {
            await ensureChapterImagesResolved(chap, book);
          }
        }
        buildActivePagesForBook(book);
        renderReaderViewport('none');
      }
    }

    function closeReader() {
      if (webtoonObserver) {
        webtoonObserver.disconnect();
        webtoonObserver = null;
      }
      clearTimeout(preloadTimer);
      document.getElementById('readerModal').classList.add('hidden');
      currentBook = null;
      currentStageModeKey = '';
    }

    function setDirection(dir) {
      const prevDir = layoutConfig.direction;
      layoutConfig.direction = dir;
      if (dir === 'rtl') {
        layoutConfig.rtlInvertButtons = true;
      }
      if (currentBook && currentBook.type !== 'manga' && (prevDir === 'vertical' || dir === 'vertical')) {
        recalculateNovelPaginationAndRender();
      } else {
        renderReaderViewport('fade');
      }
    }

    function setSpreadCount(count) {
      layoutConfig.spread = count;
      if (layoutConfig.direction === 'vertical') {
        layoutConfig.direction = 'ltr';
      }
      if (currentBook && currentBook.type !== 'manga') {
        recalculateNovelPaginationAndRender();
      } else {
        renderReaderViewport('fade');
      }
    }

    function toggleCoverOffset() {
      layoutConfig.coverOffset = !layoutConfig.coverOffset;
      document.getElementById('coverOffsetStatus').innerText = layoutConfig.coverOffset ? '开' : '关';
      renderReaderViewport('fade');
    }

    function toggleWebtoonWidth() {
      const order = ['screen', 'medium', 'wide'];
      const labels = { screen: '完整单张', medium: '适中宽幅', wide: '超宽满屏' };
      const nextIdx = (order.indexOf(layoutConfig.webtoonFit) + 1) % order.length;
      layoutConfig.webtoonFit = order[nextIdx];
      document.getElementById('webtoonFitStatus').innerText = labels[layoutConfig.webtoonFit];
      currentStageModeKey = '';
      renderReaderViewport('none');
      showToast('条漫显示尺寸：' + labels[layoutConfig.webtoonFit]);
    }

    function changeFontSize(delta) {
      layoutConfig.fontSize = Math.min(28, Math.max(14, layoutConfig.fontSize + delta));
      document.getElementById('fontSizeLabel').innerText = layoutConfig.fontSize;
      if (currentBook && currentBook.type !== 'manga') {
        recalculateNovelPaginationAndRender();
      }
    }

    function getSpreadPair(index) {
      const total = activePages.length;
      if (total === 0) return [];
      const clamped = Math.max(0, Math.min(total - 1, index));

      if (layoutConfig.spread === 1) {
        return [activePages[clamped]];
      }

      if (layoutConfig.coverOffset && clamped === 0) {
        return [activePages[0]];
      }

      let pairStart = clamped;
      if (layoutConfig.coverOffset) {
        if (pairStart % 2 === 0) pairStart -= 1;
      } else {
        if (pairStart % 2 === 1) pairStart -= 1;
      }

      const firstPage = activePages[pairStart];
      const secondPage = pairStart + 1 < total ? activePages[pairStart + 1] : null;
      return secondPage ? [firstPage, secondPage] : [firstPage];
    }

    function getStepSizeForNext() {
      if (layoutConfig.spread === 1) return 1;
      if (layoutConfig.coverOffset && currentIndex === 0) return 1;
      return 2;
    }

    function getStepSizeForPrev() {
      if (layoutConfig.spread === 1) return 1;
      if (layoutConfig.coverOffset && currentIndex === 1) return 1;
      return 2;
    }

    function goNextPage() {
      if (!currentBook) return;
      if (layoutConfig.direction === 'vertical') {
        const container = document.getElementById('verticalScrollContainer');
        if (container) container.scrollBy({ top: container.clientHeight * 0.88, behavior: 'smooth' });
        return;
      }
      const step = getStepSizeForNext();
      // In LTR, Next page slides in from Right ('enter-from-right').
      // In Japanese RTL, Next page slides in from Left ('enter-from-left').
      const slideDir = layoutConfig.direction === 'rtl' ? 'enter-from-left' : 'enter-from-right';

      if (currentIndex + step < activePages.length) {
        currentIndex += step;
        renderReaderViewport(slideDir);
      } else if (currentIndex < activePages.length - 1) {
        currentIndex = activePages.length - 1;
        renderReaderViewport(slideDir);
      } else {
        showToast('已经是最后一页了');
      }
    }

    function goPrevPage() {
      if (!currentBook) return;
      if (layoutConfig.direction === 'vertical') {
        const container = document.getElementById('verticalScrollContainer');
        if (container) container.scrollBy({ top: -container.clientHeight * 0.88, behavior: 'smooth' });
        return;
      }
      const step = getStepSizeForPrev();
      const slideDir = layoutConfig.direction === 'rtl' ? 'enter-from-right' : 'enter-from-left';

      if (currentIndex - step >= 0) {
        currentIndex -= step;
        renderReaderViewport(slideDir);
      } else if (currentIndex > 0) {
        currentIndex = 0;
        renderReaderViewport(slideDir);
      } else {
        showToast('已经是第一页了');
      }
    }

    function isNavigationInverted() {
      return layoutConfig.direction === 'rtl' && layoutConfig.rtlInvertButtons;
    }

    function toggleRtlTapInvert() {
      if (layoutConfig.direction !== 'rtl') {
        showToast('当前为左→右模式，支持鼠标滚轮直接翻页');
        return;
      }
      layoutConfig.rtlInvertButtons = !layoutConfig.rtlInvertButtons;
      renderReaderViewport('none');
      showToast(layoutConfig.rtlInvertButtons ? '已切换：左边是下一页 (日漫原生手势)' : '已切换：右边是下一页');
    }

    function onLeftButtonClick() {
      if (isNavigationInverted()) goNextPage();
      else goPrevPage();
    }

    function onRightButtonClick() {
      if (isNavigationInverted()) goPrevPage();
      else goNextPage();
    }

    function onSliderInput(val) {
      currentIndex = parseInt(val, 10) || 0;
      if (layoutConfig.direction === 'vertical') {
        const targetEl = document.getElementById('webtoon-page-' + currentIndex);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        document.getElementById('pageIndicatorLeft').innerText = `${currentIndex + 1} / ${activePages.length}`;
        return;
      }
      renderReaderViewport('fade');
    }

    // Mouse Wheel Page Turn Support
    document.getElementById('readerViewport').addEventListener('wheel', e => {
      if (!currentBook || document.getElementById('readerModal').classList.contains('hidden')) return;
      if (layoutConfig.direction === 'vertical') return;

      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTurnTime < 190) return;

      if (Math.abs(e.deltaY) > 10) {
        lastWheelTurnTime = now;
        if (e.deltaY > 0) {
          goNextPage();
        } else {
          goPrevPage();
        }
      } else if (Math.abs(e.deltaX) > 15) {
        lastWheelTurnTime = now;
        if (e.deltaX > 0) {
          onRightButtonClick();
        } else {
          onLeftButtonClick();
        }
      }
    }, { passive: false });

    // Keyboard Shortcuts
    window.addEventListener('keydown', e => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullScreen();
        return;
      }

      if (!currentBook || document.getElementById('readerModal').classList.contains('hidden')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onLeftButtonClick();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        onRightButtonClick();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        goNextPage();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goPrevPage();
      } else if (e.key === 'Escape') {
        closeReader();
      }
    });

    function updateToolbarHighlight() {
      const activeStyle = 'background-color: var(--brand-primary); color: #FFFFFF;';
      const inactiveStyle = 'background-color: transparent; color: var(--fg-muted);';

      const btnRTL = document.getElementById('btnDirRTL');
      const btnLTR = document.getElementById('btnDirLTR');
      const btnVert = document.getElementById('btnDirVertical');
      const btnSingle = document.getElementById('btnSpreadSingle');
      const btnDouble = document.getElementById('btnSpreadDouble');
      const btnOffset = document.getElementById('btnCoverOffset');
      const btnWebtoonFit = document.getElementById('btnWebtoonFit');

      btnRTL.setAttribute('style', layoutConfig.direction === 'rtl' ? activeStyle : inactiveStyle);
      btnLTR.setAttribute('style', layoutConfig.direction === 'ltr' ? activeStyle : inactiveStyle);
      btnVert.setAttribute('style', layoutConfig.direction === 'vertical' ? activeStyle : inactiveStyle);

      const isVertical = layoutConfig.direction === 'vertical';
      btnSingle.setAttribute('style', (!isVertical && layoutConfig.spread === 1) ? activeStyle : inactiveStyle);
      btnDouble.setAttribute('style', (!isVertical && layoutConfig.spread === 2) ? activeStyle : inactiveStyle);

      // Keep the xl-only button in flow and just hide its paint, so toggling it never shifts the centered toolbar
      btnOffset.classList.toggle('invisible', isVertical || layoutConfig.spread !== 2);

      // Reserve the slot even when the button is not applicable, so entering webtoon mode never shifts the centered pills
      btnWebtoonFit.classList.toggle('invisible', !(isVertical && currentBook && currentBook.type === 'manga'));

      const subStatus = document.getElementById('readerSubStatus');
      const leftNavBtn = document.getElementById('leftNavBtn');
      const rightNavBtn = document.getElementById('rightNavBtn');
      const leftNavText = document.getElementById('leftNavText');
      const rightNavText = document.getElementById('rightNavText');
      const swapTapBtn = document.getElementById('swapTapModeBtn');
      const slider = document.getElementById('readerSlider');

      // Both labels share the same character count so the header text never changes width when toggling spread
      const spreadLabel = layoutConfig.spread === 2 ? '双页并排' : '单页模式';
      const inverted = isNavigationInverted();

      if (layoutConfig.direction === 'rtl') {
        subStatus.innerText = `日漫右→左 (${inverted ? '左边是下一页' : '右边是下一页'}) · 双缓冲丝滑翻页`;
        leftNavText.innerText = inverted ? '下一页' : '上一页';
        rightNavText.innerText = inverted ? '上一页' : '下一页';
        leftNavBtn.className = inverted ? 'uiverse-btn-primary py-1 px-3.5 shrink-0' : 'uiverse-btn py-1 px-3.5 shrink-0';
        rightNavBtn.className = inverted ? 'uiverse-btn py-1 px-3.5 shrink-0' : 'uiverse-btn-primary py-1 px-3.5 shrink-0';
        swapTapBtn.innerText = inverted ? '日漫:左翻下一页(滚轮可用)' : '日漫:右翻下一页(滚轮可用)';
        if (inverted) slider.classList.add('rtl-slider');
        else slider.classList.remove('rtl-slider');
      } else if (layoutConfig.direction === 'ltr') {
        subStatus.innerText = `左→右 (右边是下一页) · ${spreadLabel} · 双缓冲丝滑翻页`;
        leftNavText.innerText = '上一页';
        rightNavText.innerText = '下一页';
        leftNavBtn.className = 'uiverse-btn py-1 px-3.5 shrink-0';
        rightNavBtn.className = 'uiverse-btn-primary py-1 px-3.5 shrink-0';
        swapTapBtn.innerText = `滚轮可翻页 · ${spreadLabel}`;
        slider.classList.remove('rtl-slider');
      } else {
        subStatus.innerText = `纵向长卷模式 · 连续平滑滚动`;
        leftNavText.innerText = '上滚一屏';
        rightNavText.innerText = '下滚一屏';
        leftNavBtn.className = 'uiverse-btn py-1 px-3.5 shrink-0';
        rightNavBtn.className = 'uiverse-btn-primary py-1 px-3.5 shrink-0';
        swapTapBtn.innerText = '上→下长卷';
        slider.classList.remove('rtl-slider');
      }
    }

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
      cardEl.style.fontSize = layoutConfig.fontSize + 'px';
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
      if (currentBook.type === 'manga') {
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
          const leftItem = layoutConfig.direction === 'rtl' ? pair[1] : pair[0];
          const rightItem = layoutConfig.direction === 'rtl' ? pair[0] : pair[1];
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
          fillNovelCardDOM(cardSingle, pair[0], layoutConfig.direction === 'rtl' ? '[右→左]' : '[左→右]', total);
        } else {
          wrap2p.classList.remove('hidden');
          wrap2p.classList.add('flex');
          wrap1p.classList.add('hidden');
          wrap1p.classList.remove('flex');
          const leftItem = layoutConfig.direction === 'rtl' ? pair[1] : pair[0];
          const rightItem = layoutConfig.direction === 'rtl' ? pair[0] : pair[1];
          const cardLeft = document.getElementById(`buf-${slotIndex}-card-left`);
          const cardRight = document.getElementById(`buf-${slotIndex}-card-right`);
          fillNovelCardDOM(cardLeft, leftItem, layoutConfig.direction === 'rtl' ? '左页(后读)' : '左页(先读)', total);
          fillNovelCardDOM(cardRight, rightItem, layoutConfig.direction === 'rtl' ? '右页(先读)' : '右页(后读)', total);
        }
      }
    }

    async function renderReaderViewport(transitionDir = 'fade') {
      if (!currentBook) return;
      const myToken = ++renderToken;
      updateToolbarHighlight();

      // Pause any background ZIP preloading while preparing or running page turn animation
      clearTimeout(preloadTimer);

      const viewport = document.getElementById('readerViewport');
      const indicator = document.getElementById('pageIndicatorLeft');
      const slider = document.getElementById('readerSlider');
      const total = activePages.length;

      slider.max = Math.max(0, total - 1);
      slider.value = currentIndex;

      // ========================================================================
      // 1. VERTICAL MODE (Webtoon / Continuous Scroll)
      // ========================================================================
      if (layoutConfig.direction === 'vertical') {
        if (webtoonObserver) {
          webtoonObserver.disconnect();
          webtoonObserver = null;
        }
        currentStageModeKey = 'vertical_' + currentBook.id + '_' + layoutConfig.webtoonFit;
        indicator.innerText = `${currentIndex + 1} / ${total}`;

        if (currentBook.type === 'manga') {
          let imgStyleClass = '';
          if (layoutConfig.webtoonFit === 'screen') {
            imgStyleClass = 'max-h-[calc(100vh-6rem)] w-auto max-w-full object-contain mx-auto';
          } else if (layoutConfig.webtoonFit === 'medium') {
            imgStyleClass = 'w-full max-w-[720px] h-auto object-contain mx-auto';
          } else {
            imgStyleClass = 'w-full max-w-[1024px] h-auto object-contain mx-auto';
          }

          viewport.innerHTML = `
            <div id="verticalScrollContainer" class="w-full h-full overflow-y-auto flex flex-col items-center py-2 gap-2">
              ${activePages.map((p, idx) => `
                <div id="webtoon-page-${idx}" class="w-full flex flex-col items-center justify-center shrink-0">
                  <img data-lazy-index="${idx}" class="manga-page-img ${imgStyleClass} bg-[var(--bg-card)] shadow-sm rounded-sm select-none" alt="第 ${p.pageNumber} 页" />
                </div>
              `).join('')}
            </div>
          `;
          const scrollRoot = document.getElementById('verticalScrollContainer');

          for (let i = Math.max(0, currentIndex - 1); i <= Math.min(total - 1, currentIndex + 2); i++) {
            ensurePageUrlLoaded(activePages[i].itemRef).then(url => {
              const el = viewport.querySelector(`img[data-lazy-index="${i}"]`);
              if (el && url) el.src = url;
            });
          }

          webtoonObserver = new IntersectionObserver(entries => {
            entries.forEach(async entry => {
              if (entry.isIntersecting) {
                const imgEl = entry.target;
                const idx = parseInt(imgEl.getAttribute('data-lazy-index'), 10);
                const pageData = activePages[idx];
                if (pageData) {
                  const url = await ensurePageUrlLoaded(pageData.itemRef);
                  if (url && imgEl.src !== url) imgEl.src = url;
                }
                currentIndex = idx;
                indicator.innerText = `${idx + 1} / ${total}`;
                slider.value = idx;
              }
            });
          }, { root: scrollRoot, rootMargin: '800px 0px', threshold: 0.1 });

          viewport.querySelectorAll('img[data-lazy-index]').forEach(img => webtoonObserver.observe(img));

          if (currentIndex > 0) {
            setTimeout(() => {
              const target = document.getElementById('webtoon-page-' + currentIndex);
              if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
            }, 50);
          }
        } else {
          viewport.innerHTML = `
            <div id="verticalScrollContainer" class="w-full h-full overflow-y-auto py-4 px-2">
              <div style="font-size: ${layoutConfig.fontSize}px;" class="max-w-3xl mx-auto bg-[var(--bg-card)] rounded-xl shadow-sm border border-[var(--border-line)] p-6 sm:p-12 space-y-8">
                ${activePages.map(p => `
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
      if (webtoonObserver) {
        webtoonObserver.disconnect();
        webtoonObserver = null;
      }

      const pair = getSpreadPair(currentIndex);
      const pageNums = pair.map(p => p.pageNumber).join('-');
      indicator.innerText = `${pageNums} / ${total}`;

      const inverted = isNavigationInverted();
      const desiredStageKey = `double_buffer_${currentBook.type}`;
      const isInitialMount = currentStageModeKey !== desiredStageKey;

      if (isInitialMount) {
        currentStageModeKey = desiredStageKey;
        activeBufferSlot = 0;

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
              ${createBufferSlotInnerHtml(0, currentBook.type)}
            </div>
            <div id="stageBuffer1" class="stage-buffer-layer z-10 pointer-events-none" style="opacity: 0; transform: translate3d(0,0,0);">
              ${createBufferSlotInnerHtml(1, currentBook.type)}
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
        if (myToken !== renderToken) return;
        scheduleIdlePreload();
        return;
      }

      // Prepare the STANDBY buffer off-screen while the current buffer remains 100% stable on screen!
      const prevSlot = activeBufferSlot;
      const nextSlot = 1 - activeBufferSlot;

      await populateBufferSlot(nextSlot, pair, total);
      if (myToken !== renderToken) return;

      // Cancel any ongoing Web Animations cleanly before starting the new transition
      activeTransitionAnims.forEach(anim => {
        try { anim.cancel(); } catch (e) {}
      });
      activeTransitionAnims = [];

      const outEl = document.getElementById(`stageBuffer${prevSlot}`);
      const inEl = document.getElementById(`stageBuffer${nextSlot}`);
      activeBufferSlot = nextSlot;

      inEl.style.zIndex = '20';
      inEl.classList.remove('pointer-events-none');
      outEl.style.zIndex = '10';
      outEl.classList.add('pointer-events-none');

      const styleMode = layoutConfig.transitionStyle;

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
      activeTransitionAnims.push(animIn, animOut);

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
      clearTimeout(preloadTimer);
      if (!currentBook || currentBook.type !== 'manga') return;

      preloadTimer = setTimeout(async () => {
        for (let i = 1; i <= 4; i++) {
          const nextPage = activePages[currentIndex + i];
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

    // Download standalone HTML copy (local CSS/JS files inlined)
    async function downloadSelf() {
      const root = document.documentElement.cloneNode(true);
      const localAssets = [...root.querySelectorAll('link[rel="stylesheet"][href], script[src]')]
        .filter(el => {
          const url = el.getAttribute(el.tagName === 'LINK' ? 'href' : 'src') || '';
          return url && !/^(?:[a-z]+:|\/\/)/i.test(url);
        });

      try {
        await Promise.all(localAssets.map(async el => {
          const isLink = el.tagName === 'LINK';
          const res = await fetch(el.getAttribute(isLink ? 'href' : 'src'), { cache: 'no-store' });
          if (!res.ok) throw new Error(`加载失败: ${el.getAttribute(isLink ? 'href' : 'src')}`);
          const text = await res.text();

          if (isLink) {
            const style = document.createElement('style');
            style.textContent = text;
            el.replaceWith(style);
          } else {
            el.removeAttribute('src');
            el.textContent = text;
          }
        }));
      } catch (e) {
        showToast('导出失败：本地样式/脚本读取不到，请用本地服务器打开页面');
        return;
      }

      const html = '<!DOCTYPE html>\n' + root.outerHTML;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Homura_Reader_UltraSmooth.html';
      a.click();
      showToast('已导出单文件离线阅读器！');
    }

    // Initialize saved theme/mode & restore the persisted bookshelf on startup
    window.addEventListener('DOMContentLoaded', async () => {
      let savedTheme = 'blue';
      let savedMode = 'light';
      try {
        savedTheme = localStorage.getItem('homura_theme_color') || 'blue';
        savedMode = localStorage.getItem('homura_surface_mode') || 'light';
      } catch (e) {}

      setThemeColor(savedTheme, true);
      setSurfaceMode(savedMode, true);

      // 书架上一次导入的作品会从 IndexedDB 里恢复；第一次使用才放示例书
      const hasStoredBooks = await restoreLibrary();
      if (!hasStoredBooks) {
        loadDemoNovel(false);
        loadDemoManga(false);
      }
      renderBookshelf();

      if (HomuraStore.disabled) {
        showToast('提示：当前环境无法保存书架，请通过本地服务器打开页面');
      }
    });
