document.addEventListener('DOMContentLoaded', () => {
  const feedContainer = document.getElementById('projects-feed');
  const themeToggle = document.getElementById('theme-toggle-btn');
  const commentConfig = {
    repo: document.body.dataset.commentsRepo || '',
    theme: document.body.dataset.commentsTheme || 'github-light',
    label: document.body.dataset.commentsLabel || 'feed-comment'
  };

  const sourcesUrl = 'data/sources.json';
  const localSourcesUrl = 'data/local-sources.json';
  const localServerInfoUrl = '.local-home-server.json';
  let posts = [];
  let sourceErrors = [];
  let visibleMediaItems = [];
  let viewerIndex = 0;
  const tapMoveTolerance = 10;
  const viewerZoomMin = 1;
  const viewerZoomMax = 8;
  const viewerWheelZoomSensitivity = 0.0016;
  const viewerZoomState = {
    scale: viewerZoomMin,
    translateX: 0,
    translateY: 0,
    baseWidth: 0,
    baseHeight: 0,
    stageWidth: 0,
    stageHeight: 0
  };
  const viewer = createMediaViewer();

  initTheme();
  initAmbientCanvas();
  loadSocialFeed();

  async function loadSocialFeed() {
    renderLoadingState();

    try {
      const sources = await loadSources();
      if (!Array.isArray(sources) || sources.length === 0) {
        throw new Error('연결된 공개 프로젝트 피드가 없습니다.');
      }

      const results = await Promise.allSettled(sources.map(loadSourceFeed));
      const loadedPosts = [];
      sourceErrors = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          loadedPosts.push(...result.value.posts);
          return;
        }

        const source = sources[index] || {};
        sourceErrors.push({
          id: source.id || `source-${index + 1}`,
          title: source.title || source.id || `Source ${index + 1}`,
          message: result.reason?.message || '피드를 불러오지 못했습니다.'
        });
      });

      posts = loadedPosts.sort((a, b) => {
        const dateCompare = b.sortDate - a.sortDate;
        if (dateCompare !== 0) return dateCompare;
        return 0;
      });

      renderFeed(posts);
    } catch (error) {
      console.error(error);
      posts = [];
      sourceErrors = [{ id: 'feed-config', title: 'Feed configuration', message: error.message }];
      renderErrorState(error.message);
    }
  }

  async function loadSourceFeed(source) {
    if (!source || !source.feedUrl) {
      throw new Error('feedUrl이 없는 source 항목입니다.');
    }

    const feed = await fetchJson(source.feedUrl);
    const baseUrl = new URL(source.feedUrl, window.location.href);
    const project = normalizeProject(feed.project || {}, source, baseUrl);
    const feedPosts = Array.isArray(feed.posts) ? feed.posts : [];

    return {
      project,
      posts: feedPosts.map((post, index) => normalizePost(post, project, baseUrl, index))
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      const error = new Error(`${url} 응답 오류: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function loadSources() {
    const publicSources = await fetchJson(sourcesUrl);
    if (!isLocalPreview()) return publicSources;

    const localSources = await fetchOptionalJson(localSourcesUrl);
    if (!Array.isArray(localSources) || localSources.length === 0) {
      return publicSources;
    }

    const localServerInfo = await fetchOptionalJson(localServerInfoUrl);
    return mergeSources(publicSources, localSources)
      .map(source => applyLocalSourceMapping(source, localServerInfo));
  }

  async function fetchOptionalJson(url) {
    try {
      return await fetchJson(url);
    } catch (error) {
      if (error.status !== 404) {
        console.warn(`Optional local source mapping ignored: ${error.message}`);
      }
      return null;
    }
  }

  function isLocalPreview() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  function mergeSources(publicSources, localSources) {
    const merged = new Map();

    (Array.isArray(publicSources) ? publicSources : []).forEach(source => {
      if (!source?.id) return;
      merged.set(source.id, { ...source });
    });

    localSources.forEach(source => {
      if (!source?.id) return;
      merged.set(source.id, { ...(merged.get(source.id) || {}), ...source });
    });

    return [...merged.values()];
  }

  function applyLocalSourceMapping(source, localServerInfo) {
    const canUseLocalProjectDir = Boolean(localServerInfo?.localProjectRoute);
    const localProjectBase = source.localProjectDir && canUseLocalProjectDir
      ? `/__local_projects/${encodeURIComponent(source.localProjectDir)}/`
      : '';

    return {
      ...source,
      feedUrl: source.localFeedUrl || (localProjectBase ? `${localProjectBase}home-feed.json` : source.feedUrl),
      pageUrl: source.localPageUrl || (localProjectBase || source.pageUrl),
      sourceUrl: source.localSourceUrl || source.sourceUrl
    };
  }

  function normalizeProject(project, source, baseUrl) {
    const sourceUrl = source.sourceUrl || project.sourceUrl || '';
    const pageUrl = source.pageUrl || project.pageUrl || sourceUrl || '';

    return {
      id: slugify(project.id || source.id || project.title || 'project'),
      title: project.title || source.title || source.id || 'Untitled project',
      description: project.description || '',
      pageUrl: resolveUrl(pageUrl, baseUrl),
      sourceUrl: resolveUrl(sourceUrl, baseUrl),
      tags: normalizeTags([...(project.tags || []), ...(source.tags || [])])
    };
  }

  function normalizePost(post, project, baseUrl, index) {
    const media = normalizeMedia(post.media || [], baseUrl);
    const type = normalizePostType(post.type, media);
    const date = post.date || '';
    const sortDate = new Date(`${date || '1970-01-01'}T00:00:00`).getTime() || 0;
    const id = slugify(post.id || `${project.id}-${index + 1}`);

    return {
      id,
      project,
      title: post.title || project.title,
      text: post.text || post.description || '',
      date,
      sortDate,
      type,
      media,
      url: resolveUrl(post.url || project.pageUrl, baseUrl),
      linkLabel: post.linkLabel || post.urlLabel || post.linkText || '',
      tags: normalizeTags([...(project.tags || []), ...(post.tags || [])])
    };
  }

  function normalizeMedia(media, baseUrl) {
    if (!Array.isArray(media)) return [];

    return media
      .filter(item => item && item.url)
      .map(item => ({
        type: normalizeMediaType(item.type, item.url),
        url: resolveUrl(item.url, baseUrl),
        alt: item.alt || '',
        poster: item.poster ? resolveUrl(item.poster, baseUrl) : '',
        title: item.title || ''
      }));
  }

  function normalizeMediaType(type, url) {
    const value = String(type || '').toLowerCase();
    if (value) return value;

    const pathname = String(url || '').toLowerCase();
    if (pathname.endsWith('.gif')) return 'gif';
    if (pathname.endsWith('.mp4') || pathname.endsWith('.webm')) return 'video';
    return 'image';
  }

  function normalizePostType(type, media) {
    const value = String(type || '').toLowerCase();
    if (['image', 'gallery', 'gif', 'video', 'embed', 'text'].includes(value)) return value;
    if (media.length > 1) return 'gallery';
    if (media[0]) return media[0].type;
    return 'text';
  }

  function normalizeTags(tags) {
    return [...new Set((tags || []).map(tag => String(tag).trim()).filter(Boolean))];
  }

  function resolveUrl(value, baseUrl) {
    if (!value) return '';
    if (value === '#') return '#';

    try {
      return new URL(value, baseUrl).href;
    } catch {
      return value;
    }
  }

  function renderFeed(postList) {
    if (!feedContainer) return;

    feedContainer.innerHTML = '';
    visibleMediaItems = buildViewerItems(postList);

    sourceErrors.forEach(error => {
      feedContainer.appendChild(createNoticeCard(error));
    });

    if (postList.length === 0) {
      renderEmptyState();
      return;
    }

    postList.forEach((post, index) => {
      const card = createPostCard(post);
      card.style.setProperty('--enter-delay', `${Math.min(index * 70, 420)}ms`);
      feedContainer.appendChild(card);
    });
  }

  function createPostCard(post) {
    const card = document.createElement('article');
    const visualMedia = post.media.filter(isVisualMedia);
    const usesMediaGrid = shouldRenderMediaGrid(post, visualMedia);
    const cardClasses = ['post-card', post.type];
    if (usesMediaGrid && post.type !== 'gallery') cardClasses.push('gallery');
    card.className = cardClasses.map(escapeAttribute).join(' ');
    card.dataset.postId = post.id;

    const commentPanelId = `comments-${post.project.id}-${post.id}`;

    card.innerHTML = `
      ${renderMedia(post)}

      <div class="post-body">
        <div class="post-kicker">
          <span>${escapeHtml(post.project.title)}</span>
          <span>${post.date ? escapeHtml(formatDate(post.date)) : getTypeLabel(post.type)}</span>
        </div>
        <h2 class="post-title">${escapeHtml(post.title)}</h2>
        ${renderPostDescription(post)}
        ${renderCompactTags(post.tags)}
      </div>

      <div class="post-actions" aria-label="포스트 작업">
        <button class="action-button comments-toggle" type="button" aria-expanded="false" aria-controls="${commentPanelId}">댓글</button>
      </div>

      <div class="comments-panel" id="${commentPanelId}" hidden></div>
    `;

    card.querySelectorAll('.media-slide img, .gallery-grid img').forEach(image => {
      image.addEventListener('error', () => {
        image.replaceWith(createFallbackElement(post.title));
      });
    });

    setupGalleryGridLayout(card);

    card.querySelectorAll('[data-viewer-index]').forEach(bindViewerTrigger);

    const commentsButton = card.querySelector('.comments-toggle');
    const commentsPanel = card.querySelector('.comments-panel');
    commentsButton.addEventListener('click', () => {
      const isExpanded = commentsButton.getAttribute('aria-expanded') === 'true';
      commentsButton.setAttribute('aria-expanded', String(!isExpanded));
      commentsPanel.hidden = isExpanded;

      if (!isExpanded && !commentsPanel.dataset.loaded) {
        loadComments(post, commentsPanel, commentsButton);
      }
    });

    return card;
  }

  function renderMedia(post) {
    if (post.type === 'embed' && post.media[0]) {
      const embed = post.media[0];
      return `
        <div class="media-showcase embed-showcase">
          <div class="media-overlay">
            <span class="status-pill ${escapeAttribute(post.type)}">${getTypeLabel(post.type)}</span>
            <span>${escapeHtml(post.project.title)}</span>
          </div>
          <iframe src="${escapeAttribute(embed.url)}" title="${escapeAttribute(embed.title || post.title)}" loading="lazy" allowfullscreen></iframe>
        </div>
      `;
    }

    const mediaItems = post.media
      .map((item, mediaIndex) => ({ item, mediaIndex }))
      .filter(({ item }) => isVisualMedia(item));

    if (shouldRenderMediaGrid(post, mediaItems)) {
      return renderMediaGrid(mediaItems, post);
    }

    if (mediaItems.length > 0) {
      return `
        <div class="media-showcase ${mediaItems.length > 1 ? 'has-carousel' : ''}">
          <div class="media-overlay">
            <span class="status-pill ${escapeAttribute(post.type)}">${getTypeLabel(post.type)}</span>
            <span>${mediaItems.length > 1 ? `${mediaItems.length}장` : '탭해서 확대'}</span>
          </div>
          <div class="media-rail" aria-label="${escapeAttribute(post.title)} 미디어">
            ${mediaItems.map(({ item, mediaIndex }, displayIndex) => renderMediaSlide(item, post, mediaIndex, displayIndex, mediaItems.length)).join('')}
          </div>
          ${mediaItems.length > 1 ? '<div class="swipe-cue" aria-hidden="true">좌우 스와이프</div>' : ''}
        </div>
      `;
    }

    return `
      <div class="media-showcase">
        <div class="media-slide fallback-slide">
          ${renderFallback(post.title)}
        </div>
      </div>
    `;
  }

  function renderMediaGrid(mediaItems, post) {
    return `
      <div class="media-showcase gallery-showcase">
        <div class="gallery-header">
          <span class="status-pill ${escapeAttribute(post.type)}">${getTypeLabel(post.type)}</span>
          <span>${mediaItems.length}장</span>
        </div>
        <div class="gallery-grid" data-count="${mediaItems.length}" aria-label="${escapeAttribute(post.title)} 미디어 그리드">
          ${mediaItems.map(({ item, mediaIndex }, displayIndex) => renderGalleryTile(item, post, mediaIndex, displayIndex, mediaItems.length)).join('')}
        </div>
      </div>
    `;
  }

  function shouldRenderMediaGrid(post, mediaItems) {
    return mediaItems.length > 1 || (post.type === 'gallery' && mediaItems.length > 0);
  }

  function renderGalleryTile(item, post, mediaIndex, displayIndex, total) {
    const index = findVisibleMediaIndex(post, mediaIndex);
    const countLabel = total > 1 ? `${displayIndex + 1} / ${total}` : '전체 화면';

    if (item.type === 'video') {
      return `
        <div class="gallery-thumb media-${escapeAttribute(item.type)}">
          <button class="gallery-open-button" type="button" data-viewer-index="${index}" aria-label="${escapeAttribute(post.title)} 영상 전체 화면으로 보기">
            <video muted playsinline preload="metadata" ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ''}>
              <source src="${escapeAttribute(item.url)}">
            </video>
            <span class="gallery-count">${countLabel}</span>
          </button>
        </div>
      `;
    }

    return `
      <div class="gallery-thumb media-${escapeAttribute(item.type)}">
        <button class="gallery-open-button" type="button" data-viewer-index="${index}" aria-label="${escapeAttribute(item.alt || post.title)} 전체 화면으로 보기">
          <img src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.alt || post.title)}" loading="lazy" decoding="async">
          <span class="gallery-count">${countLabel}</span>
        </button>
      </div>
    `;
  }

  function setupGalleryGridLayout(card) {
    card.querySelectorAll('.gallery-grid').forEach(grid => {
      const mediaElements = Array.from(grid.querySelectorAll('img, video'));
      if (mediaElements.length === 0) return;

      const syncLayout = () => {
        const dimensions = mediaElements
          .map(getMediaDimensions)
          .filter(Boolean);

        if (dimensions.length === 0) return;

        applyGalleryGridLayout(grid, chooseGalleryGridLayout(grid, dimensions, mediaElements.length), dimensions);
      };

      mediaElements.forEach(media => {
        if (getMediaDimensions(media)) return;
        media.addEventListener(media.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', syncLayout, { once: true });
      });

      syncLayout();
      window.addEventListener('resize', syncLayout);
    });
  }

  function getMediaDimensions(media) {
    const width = media.naturalWidth || media.videoWidth || 0;
    const height = media.naturalHeight || media.videoHeight || 0;
    if (!width || !height) return null;
    return { width, height, ratio: width / height };
  }

  function chooseGalleryGridLayout(grid, dimensions, totalCount) {
    const ratios = dimensions.map(item => item.ratio).sort((a, b) => a - b);
    const medianRatio = ratios[Math.floor(ratios.length / 2)] || 1;
    const orientation = getGalleryOrientation(ratios);
    const gridWidth = Math.max(grid.clientWidth || grid.getBoundingClientRect().width || 0, 320);
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    const maxColumns = isMobile ? Math.min(2, totalCount) : Math.min(gridWidth >= 860 ? 4 : 3, totalCount);

    if (totalCount <= 1) {
      return {
        columns: 1,
        rows: 1,
        tileRatio: getGalleryTileRatio(medianRatio, orientation),
        orientation,
        mode: 'single'
      };
    }

    if (totalCount === 2) {
      return { columns: 2, rows: 1, tileRatio: 1, orientation, mode: 'pair' };
    }

    if (totalCount === 3) {
      return { columns: 2, rows: 2, tileRatio: 1, orientation, mode: 'feature-3' };
    }

    if (totalCount === 4) {
      return { columns: 2, rows: 2, tileRatio: 1, orientation, mode: 'quad' };
    }

    const preferredColumns = isMobile ? 2 : totalCount < 7 ? 3 : maxColumns;
    let best = null;

    for (let columns = 2; columns <= maxColumns; columns += 1) {
      const rows = Math.ceil(totalCount / columns);
      const remainder = totalCount % columns;
      const emptySlots = remainder === 0 ? 0 : columns - remainder;
      let score = emptySlots * 25 + Math.abs(columns - preferredColumns) * 12;

      if (remainder === 0) score -= 50;
      if (remainder === 1) score += 80;
      if (columns === 4 && gridWidth < 760) score += 35;
      if (orientation === 'wide' && columns < maxColumns) score += 8;

      const candidate = { columns, rows, tileRatio: 1, orientation, mode: 'balanced', score };
      if (!best || candidate.score < best.score) best = candidate;
    }

    return best || { columns: 2, rows: Math.ceil(totalCount / 2), tileRatio: 1, orientation, mode: 'balanced' };
  }

  function getGalleryOrientation(ratios) {
    const wideCount = ratios.filter(ratio => ratio >= 1.25).length;
    const portraitCount = ratios.filter(ratio => ratio <= 0.82).length;
    const threshold = Math.max(1, Math.ceil(ratios.length * 0.6));

    if (wideCount >= threshold) return 'wide';
    if (portraitCount >= threshold) return 'portrait';
    return 'mixed';
  }

  function getGalleryTileRatio(medianRatio, orientation) {
    if (orientation === 'wide') return Math.min(21 / 9, Math.max(16 / 10, medianRatio));
    if (orientation === 'portrait') return Math.max(3 / 4, Math.min(4 / 5, medianRatio));
    return Math.min(16 / 9, Math.max(4 / 5, medianRatio));
  }

  function applyGalleryGridLayout(grid, layout, dimensions) {
    grid.style.setProperty('--gallery-tile-ratio', String(layout.tileRatio));
    grid.dataset.layout = layout.mode || `${layout.columns}x${layout.rows}`;
    grid.dataset.orientation = layout.orientation;

    const thumbs = Array.from(grid.querySelectorAll('.gallery-thumb'));
    const totalCount = thumbs.length;
    grid.dataset.count = String(totalCount);

    const baseSpan = 12 / Math.max(1, layout.columns);
    const remainder = totalCount % layout.columns;
    const finalRowSpan = remainder > 0 ? 12 / remainder : baseSpan;

    thumbs.forEach((thumb, index) => {
      const ratio = dimensions[index]?.ratio || 1;
      thumb.dataset.orientation = ratio >= 1.25 ? 'wide' : ratio <= 0.82 ? 'portrait' : 'square';

      if (layout.mode === 'feature-3') {
        thumb.style.removeProperty('--gallery-span');
        thumb.style.removeProperty('--gallery-thumb-ratio');
        return;
      }

      const isFinalPartialRow = remainder > 0 && index >= totalCount - remainder;
      thumb.style.setProperty('--gallery-span', String(isFinalPartialRow ? finalRowSpan : baseSpan));

      if (isFinalPartialRow) {
        thumb.style.setProperty('--gallery-thumb-ratio', String((layout.columns / remainder) * layout.tileRatio));
      } else {
        thumb.style.removeProperty('--gallery-thumb-ratio');
      }
    });
  }

  function renderMediaSlide(item, post, mediaIndex, displayIndex, total) {
    const index = findVisibleMediaIndex(post, mediaIndex);
    const countLabel = total > 1 ? `${displayIndex + 1} / ${total}` : '전체 화면';

    if (item.type === 'video') {
      return `
        <div class="media-slide media-${escapeAttribute(item.type)}">
          <video controls playsinline preload="metadata" ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ''}>
            <source src="${escapeAttribute(item.url)}">
          </video>
          <button class="media-expand" type="button" data-viewer-index="${index}" aria-label="${escapeAttribute(post.title)} 영상 전체 화면으로 보기">${countLabel}</button>
        </div>
      `;
    }

    return `
      <div class="media-slide media-${escapeAttribute(item.type)}"${item.type === 'gif' ? ` style="--media-url: url('${escapeAttribute(item.url)}')"` : ''}>
        <button class="media-open-button" type="button" data-viewer-index="${index}" aria-label="${escapeAttribute(item.alt || post.title)} 전체 화면으로 보기">
          <img src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.alt || post.title)}" loading="lazy" decoding="async">
          <span class="media-expand">${countLabel}</span>
        </button>
      </div>
    `;
  }

  function findVisibleMediaIndex(post, mediaIndex) {
    return visibleMediaItems.findIndex(item => (
      item.projectId === post.project.id &&
      item.postId === post.id &&
      item.mediaIndex === mediaIndex
    ));
  }

  function bindViewerTrigger(button) {
    let startX = 0;
    let startY = 0;
    let trackingPointer = false;
    let suppressClick = false;

    button.addEventListener('pointerdown', event => {
      if (typeof event.button === 'number' && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      trackingPointer = true;
      suppressClick = false;
    });

    button.addEventListener('pointermove', event => {
      if (!trackingPointer) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.hypot(deltaX, deltaY) > tapMoveTolerance) {
        suppressClick = true;
      }
    });

    button.addEventListener('pointerup', () => {
      trackingPointer = false;
    });

    button.addEventListener('pointercancel', () => {
      trackingPointer = false;
      suppressClick = true;
    });

    button.addEventListener('click', event => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = false;
        return;
      }

      const index = Number(button.dataset.viewerIndex);
      if (Number.isInteger(index) && index >= 0) {
        openViewer(index);
      }
    });
  }

  function buildViewerItems(postList) {
    const items = [];

    postList.forEach(post => {
      const visualMedia = post.media.filter(isVisualMedia);

      post.media.forEach((media, mediaIndex) => {
        if (!isVisualMedia(media)) return;

        items.push({
          ...media,
          mediaIndex,
          totalInPost: visualMedia.length,
          postId: post.id,
          projectId: post.project.id,
          postTitle: post.title,
          projectTitle: post.project.title,
          date: post.date,
          tags: post.tags,
          postUrl: post.url,
          sourceUrl: post.project.sourceUrl
        });
      });
    });

    return items;
  }

  function isVisualMedia(item) {
    return item && ['image', 'gif', 'video'].includes(item.type);
  }

  function renderPostDescription(post) {
    const hasText = Boolean(post.text);
    const hasLink = Boolean(post.url && post.url !== '#');
    if (!hasText && !hasLink) return '';
    const linkLabel = post.linkLabel || '링크 열기';

    return `
      <p class="post-description${hasLink ? ' has-link' : ''}">
        ${hasText ? `<span>${escapeHtml(post.text)}</span>` : ''}
        ${hasLink ? `<a class="post-description-link" href="${escapeAttribute(post.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel)}</a>` : ''}
      </p>
    `;
  }

  function createNoticeCard(error) {
    const card = document.createElement('article');
    card.className = 'post-card notice-card';
    card.innerHTML = `
      <div class="post-body">
        <h2 class="post-title">${escapeHtml(error.title)}</h2>
        <p class="post-description">${escapeHtml(error.message)}</p>
      </div>
    `;
    return card;
  }

  function loadComments(post, container, button) {
    container.dataset.loaded = 'true';
    container.innerHTML = '';
    button.disabled = true;
    button.textContent = '댓글 로딩';

    if (!commentConfig.repo) {
      container.innerHTML = `
        <p class="comments-note">
          댓글 저장소가 설정되지 않았습니다. <code>body[data-comments-repo]</code>에 GitHub 저장소를 지정해 주세요.
        </p>
      `;
      button.disabled = false;
      button.textContent = '댓글';
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://utteranc.es/client.js';
    script.setAttribute('repo', commentConfig.repo);
    script.setAttribute('issue-term', `feed-${post.project.id}-${post.id}`);
    script.setAttribute('label', commentConfig.label);
    script.setAttribute('theme', commentConfig.theme);
    script.setAttribute('crossorigin', 'anonymous');
    script.async = true;
    script.addEventListener('load', () => {
      button.disabled = false;
      button.textContent = '댓글';
    });
    script.addEventListener('error', () => {
      delete container.dataset.loaded;
      button.disabled = false;
      button.textContent = '댓글';
      container.innerHTML = `
        <p class="comments-note">
          댓글을 불러오지 못했습니다. 네트워크 또는 utterances 설정을 확인해 주세요.
        </p>
      `;
    });

    const note = document.createElement('p');
    note.className = 'comments-note';
    note.textContent = 'GitHub 계정으로 댓글을 남길 수 있습니다.';
    container.appendChild(note);
    container.appendChild(script);
  }

  function renderCompactTags(tags = []) {
    const visibleTags = Array.isArray(tags) ? tags.slice(0, 3) : [];
    if (visibleTags.length === 0) return '';

    return `
      <div class="tag-list" aria-label="태그">
        ${visibleTags.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
      </div>
    `;
  }

  function renderFallback(title) {
    return `
      <div class="thumbnail-fallback" aria-hidden="true">
        <span>${escapeHtml(getInitials(title))}</span>
      </div>
    `;
  }

  function createFallbackElement(title) {
    const fallback = document.createElement('div');
    fallback.className = 'thumbnail-fallback';
    fallback.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = getInitials(title);
    fallback.appendChild(text);

    return fallback;
  }

  function createMediaViewer() {
    const dialog = document.createElement('dialog');
    dialog.className = 'media-viewer';
    dialog.innerHTML = `
      <div class="viewer-shell">
        <button class="viewer-close" type="button" aria-label="닫기">닫기</button>
        <button class="viewer-nav viewer-prev" type="button" aria-label="이전 이미지">이전</button>
        <div class="viewer-stage" tabindex="-1"></div>
        <button class="viewer-nav viewer-next" type="button" aria-label="다음 이미지">다음</button>
        <footer class="viewer-caption">
          <div>
            <div class="viewer-title"></div>
            <div class="viewer-meta"></div>
          </div>
        </footer>
      </div>
    `;
    document.body.appendChild(dialog);

    const stage = dialog.querySelector('.viewer-stage');
    const closeButton = dialog.querySelector('.viewer-close');
    const prevButton = dialog.querySelector('.viewer-prev');
    const nextButton = dialog.querySelector('.viewer-next');
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMode = 'none';
    let touchPanStartX = 0;
    let touchPanStartY = 0;
    let touchPanOriginX = 0;
    let touchPanOriginY = 0;
    let pinchStartDistance = 0;
    let pinchStartScale = viewerZoomMin;
    let pinchLocalX = 0;
    let pinchLocalY = 0;
    let pointerPan = null;

    closeButton.addEventListener('click', closeViewer);
    prevButton.addEventListener('click', () => moveViewer(-1));
    nextButton.addEventListener('click', () => moveViewer(1));

    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeViewer();
    });

    dialog.addEventListener('close', () => {
      document.body.classList.remove('viewer-open');
    });

    window.addEventListener('resize', syncViewerMediaFit);

    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveViewer(-1);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveViewer(1);
      }
    });

    stage.addEventListener('wheel', event => {
      if (!getZoomableViewerMedia()) return;

      event.preventDefault();
      const nextScale = viewerZoomState.scale * Math.exp(-event.deltaY * viewerWheelZoomSensitivity);
      zoomViewerAt(nextScale, event.clientX, event.clientY);
    }, { passive: false });

    stage.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0 || viewerZoomState.scale <= viewerZoomMin) return;
      if (!getZoomableViewerMedia()) return;

      event.preventDefault();
      pointerPan = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewerZoomState.translateX,
        originY: viewerZoomState.translateY
      };
      stage.classList.add('is-panning');
      stage.setPointerCapture?.(event.pointerId);
    });

    stage.addEventListener('pointermove', event => {
      if (!pointerPan || pointerPan.id !== event.pointerId) return;

      event.preventDefault();
      setViewerPan(
        pointerPan.originX + event.clientX - pointerPan.startX,
        pointerPan.originY + event.clientY - pointerPan.startY
      );
    });

    stage.addEventListener('pointerup', endPointerPan);
    stage.addEventListener('pointercancel', endPointerPan);

    stage.addEventListener('touchstart', event => {
      if (event.touches.length === 2 && getZoomableViewerMedia()) {
        event.preventDefault();
        touchMode = 'pinch';
        startViewerPinch(event.touches[0], event.touches[1], stage);
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchMode = viewerZoomState.scale > viewerZoomMin && getZoomableViewerMedia() ? 'pan' : 'swipe';

      if (touchMode === 'pan') {
        event.preventDefault();
        touchPanStartX = touch.clientX;
        touchPanStartY = touch.clientY;
        touchPanOriginX = viewerZoomState.translateX;
        touchPanOriginY = viewerZoomState.translateY;
        stage.classList.add('is-panning');
      }
    }, { passive: false });

    stage.addEventListener('touchmove', event => {
      if (event.touches.length === 2 && getZoomableViewerMedia()) {
        event.preventDefault();
        touchMode = 'pinch';
        updateViewerPinch(event.touches[0], event.touches[1], stage);
        return;
      }

      if (touchMode !== 'pan' || event.touches.length !== 1) return;

      const touch = event.touches[0];
      event.preventDefault();
      setViewerPan(
        touchPanOriginX + touch.clientX - touchPanStartX,
        touchPanOriginY + touch.clientY - touchPanStartY
      );
    }, { passive: false });

    stage.addEventListener('touchend', event => {
      if (touchMode === 'pinch' && event.touches.length === 1) {
        const touch = event.touches[0];
        touchMode = viewerZoomState.scale > viewerZoomMin ? 'pan' : 'swipe';
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchPanStartX = touch.clientX;
        touchPanStartY = touch.clientY;
        touchPanOriginX = viewerZoomState.translateX;
        touchPanOriginY = viewerZoomState.translateY;
        return;
      }

      if (touchMode === 'pan') {
        if (event.touches.length === 0) {
          touchMode = 'none';
          stage.classList.remove('is-panning');
        }
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        moveViewer(deltaX < 0 ? 1 : -1);
      }

      if (event.touches.length === 0) touchMode = 'none';
    }, { passive: true });

    stage.addEventListener('touchcancel', () => {
      touchMode = 'none';
      stage.classList.remove('is-panning');
    });

    return dialog;

    function endPointerPan(event) {
      if (!pointerPan || pointerPan.id !== event.pointerId) return;
      stage.releasePointerCapture?.(event.pointerId);
      pointerPan = null;
      stage.classList.remove('is-panning');
    }

    function startViewerPinch(touchA, touchB, targetStage) {
      pinchStartDistance = getTouchDistance(touchA, touchB);
      pinchStartScale = viewerZoomState.scale;
      const midpoint = getTouchMidpoint(touchA, touchB);
      const stagePoint = getStagePoint(targetStage, midpoint.x, midpoint.y);

      pinchLocalX = (stagePoint.x - viewerZoomState.translateX) / viewerZoomState.scale;
      pinchLocalY = (stagePoint.y - viewerZoomState.translateY) / viewerZoomState.scale;
      targetStage.classList.remove('is-panning');
    }

    function updateViewerPinch(touchA, touchB, targetStage) {
      if (!pinchStartDistance) return;

      const distance = getTouchDistance(touchA, touchB);
      const midpoint = getTouchMidpoint(touchA, touchB);
      const stagePoint = getStagePoint(targetStage, midpoint.x, midpoint.y);
      const nextScale = clamp(
        pinchStartScale * (distance / pinchStartDistance),
        viewerZoomMin,
        viewerZoomMax
      );

      viewerZoomState.scale = nextScale;
      viewerZoomState.translateX = stagePoint.x - pinchLocalX * nextScale;
      viewerZoomState.translateY = stagePoint.y - pinchLocalY * nextScale;
      applyViewerZoom();
    }
  }

  function openViewer(index) {
    if (!visibleMediaItems[index]) return;

    viewerIndex = index;
    renderViewer();
    document.body.classList.add('viewer-open');

    if (typeof viewer.showModal === 'function' && !viewer.open) {
      viewer.showModal();
    } else {
      viewer.setAttribute('open', '');
    }

    requestAnimationFrame(syncViewerMediaFit);
    viewer.querySelector('.viewer-stage')?.focus({ preventScroll: true });
  }

  function closeViewer() {
    if (typeof viewer.close === 'function' && viewer.open) {
      viewer.close();
    } else {
      viewer.removeAttribute('open');
      document.body.classList.remove('viewer-open');
    }
  }

  function moveViewer(direction) {
    if (visibleMediaItems.length < 2) return;
    viewerIndex = (viewerIndex + direction + visibleMediaItems.length) % visibleMediaItems.length;
    renderViewer();
  }

  function renderViewer() {
    const item = visibleMediaItems[viewerIndex];
    if (!item) return;

    resetViewerZoom();

    const stage = viewer.querySelector('.viewer-stage');
    const title = viewer.querySelector('.viewer-title');
    const meta = viewer.querySelector('.viewer-meta');
    const navButtons = viewer.querySelectorAll('.viewer-nav');
    const mediaLabel = escapeAttribute(item.alt || item.postTitle);

    stage.innerHTML = item.type === 'video'
      ? `
        <video controls autoplay playsinline ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ''}>
          <source src="${escapeAttribute(item.url)}">
        </video>
      `
      : `<img src="${escapeAttribute(item.url)}" alt="${mediaLabel}" draggable="false">`;

    const media = stage.querySelector('img, video');
    media?.addEventListener(item.type === 'video' ? 'loadedmetadata' : 'load', syncViewerMediaFit, { once: true });
    requestAnimationFrame(syncViewerMediaFit);

    title.textContent = item.postTitle;
    meta.textContent = [
      `${viewerIndex + 1} / ${visibleMediaItems.length}`,
      item.projectTitle,
      item.date ? formatDate(item.date) : ''
    ].filter(Boolean).join(' · ');

    viewer.classList.toggle('is-single', visibleMediaItems.length < 2);
    navButtons.forEach(button => {
      button.disabled = visibleMediaItems.length < 2;
    });
  }

  function syncViewerMediaFit() {
    if (!viewer.open) return;

    const stage = viewer.querySelector('.viewer-stage');
    const media = stage?.querySelector('img, video');
    if (!stage || !media) return;

    const stageRect = stage.getBoundingClientRect();
    const mediaWidth = media.naturalWidth || media.videoWidth;
    const mediaHeight = media.naturalHeight || media.videoHeight;
    if (!stageRect.width || !stageRect.height || !mediaWidth || !mediaHeight) return;

    const stageRatio = stageRect.width / stageRect.height;
    const mediaRatio = mediaWidth / mediaHeight;
    const fitScale = Math.min(1, stageRect.width / mediaWidth, stageRect.height / mediaHeight);
    const fitWidth = mediaWidth * fitScale;
    const fitHeight = mediaHeight * fitScale;

    media.classList.remove('viewer-fit-width', 'viewer-fit-height', 'viewer-fit-fill');
    viewerZoomState.baseWidth = fitWidth;
    viewerZoomState.baseHeight = fitHeight;
    viewerZoomState.stageWidth = stageRect.width;
    viewerZoomState.stageHeight = stageRect.height;
    viewerZoomState.scale = clamp(viewerZoomState.scale, viewerZoomMin, viewerZoomMax);

    if (Math.abs(stageRatio - mediaRatio) < 0.01) {
      media.classList.add('viewer-fit-fill');
    } else if (mediaRatio > stageRatio) {
      media.classList.add('viewer-fit-width');
    } else {
      media.classList.add('viewer-fit-height');
    }

    applyViewerZoom();
  }

  function getZoomableViewerMedia() {
    const stage = viewer.querySelector('.viewer-stage');
    const media = stage?.querySelector('img');
    if (!media || !media.naturalWidth || !media.naturalHeight) return null;
    return media;
  }

  function resetViewerZoom() {
    viewerZoomState.scale = viewerZoomMin;
    viewerZoomState.translateX = 0;
    viewerZoomState.translateY = 0;
    viewerZoomState.baseWidth = 0;
    viewerZoomState.baseHeight = 0;
    viewerZoomState.stageWidth = 0;
    viewerZoomState.stageHeight = 0;

    const stage = viewer.querySelector('.viewer-stage');
    stage?.classList.remove('can-zoom', 'is-zoomed', 'is-panning');
  }

  function applyViewerZoom() {
    const stage = viewer.querySelector('.viewer-stage');
    const media = stage?.querySelector('img, video');
    if (!stage || !media || !viewerZoomState.baseWidth || !viewerZoomState.baseHeight) return;

    const displayWidth = viewerZoomState.baseWidth * viewerZoomState.scale;
    const displayHeight = viewerZoomState.baseHeight * viewerZoomState.scale;
    const maxTranslateX = Math.max(0, (displayWidth - viewerZoomState.stageWidth) / 2);
    const maxTranslateY = Math.max(0, (displayHeight - viewerZoomState.stageHeight) / 2);

    viewerZoomState.translateX = clamp(viewerZoomState.translateX, -maxTranslateX, maxTranslateX);
    viewerZoomState.translateY = clamp(viewerZoomState.translateY, -maxTranslateY, maxTranslateY);

    const isZoomable = media.tagName === 'IMG' && Boolean(media.naturalWidth && media.naturalHeight);

    media.style.width = `${Math.round(Math.max(1, displayWidth))}px`;
    media.style.height = `${Math.round(Math.max(1, displayHeight))}px`;
    media.style.transform = `translate3d(${viewerZoomState.translateX}px, ${viewerZoomState.translateY}px, 0)`;
    stage.classList.toggle('can-zoom', isZoomable);
    stage.classList.toggle('is-zoomed', isZoomable && viewerZoomState.scale > viewerZoomMin + 0.01);
  }

  function zoomViewerAt(nextScale, clientX, clientY) {
    const stage = viewer.querySelector('.viewer-stage');
    if (!stage || !viewerZoomState.baseWidth || !viewerZoomState.baseHeight) return;

    const currentScale = viewerZoomState.scale;
    const clampedScale = clamp(nextScale, viewerZoomMin, viewerZoomMax);
    if (Math.abs(clampedScale - currentScale) < 0.001) return;

    const point = getStagePoint(stage, clientX, clientY);
    const localX = (point.x - viewerZoomState.translateX) / currentScale;
    const localY = (point.y - viewerZoomState.translateY) / currentScale;

    viewerZoomState.scale = clampedScale;
    viewerZoomState.translateX = point.x - localX * clampedScale;
    viewerZoomState.translateY = point.y - localY * clampedScale;
    applyViewerZoom();
  }

  function setViewerPan(nextX, nextY) {
    viewerZoomState.translateX = nextX;
    viewerZoomState.translateY = nextY;
    applyViewerZoom();
  }

  function getStagePoint(stage, clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2)
    };
  }

  function getTouchDistance(touchA, touchB) {
    return Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
  }

  function getTouchMidpoint(touchA, touchB) {
    return {
      x: (touchA.clientX + touchB.clientX) / 2,
      y: (touchA.clientY + touchB.clientY) / 2
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function renderLoadingState() {
    if (!feedContainer) return;
    feedContainer.innerHTML = `
      <section class="empty-state">
        <h2>피드를 불러오는 중입니다</h2>
        <p>공개 프로젝트의 시각 결과물을 모으고 있습니다.</p>
      </section>
    `;
  }

  function renderEmptyState() {
    if (!feedContainer) return;

    const hasWarnings = sourceErrors.length > 0;
    const emptyState = document.createElement('section');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <h2>${hasWarnings ? '표시할 포스트가 없습니다' : '아직 표시할 포스트가 없습니다'}</h2>
      <p>${hasWarnings ? '연결된 공개 피드 URL과 GitHub Pages 배포 상태를 확인해 주세요.' : '공개 프로젝트 feed JSON에 포스트를 추가해 주세요.'}</p>
    `;
    feedContainer.appendChild(emptyState);
  }

  function renderErrorState(message) {
    if (!feedContainer) return;
    feedContainer.innerHTML = `
      <section class="empty-state">
        <h2>데이터를 불러올 수 없습니다</h2>
        <p>${escapeHtml(message)}</p>
      </section>
    `;
  }

  function getTypeLabel(type) {
    const labels = {
      image: '이미지',
      gallery: '갤러리',
      gif: 'GIF',
      video: '영상',
      embed: '데모',
      text: '노트'
    };
    return labels[type] || '포스트';
  }

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  function getInitials(value) {
    const words = String(value || 'Weekly Project').trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  function slugify(value) {
    return String(value || 'item')
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('home-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);

    themeToggle?.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
      localStorage.setItem('home-theme', nextTheme);
    });
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle?.setAttribute('aria-pressed', String(theme === 'dark'));
  }

  function initAmbientCanvas() {
    const canvas = document.getElementById('ambient-canvas');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!canvas || reduceMotion.matches) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    function resizeCanvas() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(time) {
      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;

      for (let i = 0; i < 9; i += 1) {
        const y = ((i * 92) + (time * 0.018)) % (height + 160) - 80;
        const alpha = 0.035 + (i % 3) * 0.018;
        context.beginPath();
        context.moveTo(-40, y);
        context.bezierCurveTo(width * 0.24, y - 42, width * 0.68, y + 58, width + 40, y + 8);
        context.strokeStyle = `rgba(37, 99, 235, ${alpha})`;
        context.stroke();
      }

      requestAnimationFrame(draw);
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(draw);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
  }
});
