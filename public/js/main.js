document.addEventListener('DOMContentLoaded', () => {
  const feedContainer = document.getElementById('projects-feed');
  const searchInput = document.getElementById('search-input');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const statTotal = document.getElementById('stat-total');
  const statPublished = document.getElementById('stat-published');
  const statDraft = document.getElementById('stat-draft');
  const statArchived = document.getElementById('stat-archived');
  const themeToggle = document.getElementById('theme-toggle-btn');
  const commentConfig = {
    repo: document.body.dataset.commentsRepo || '',
    theme: document.body.dataset.commentsTheme || 'github-light',
    label: document.body.dataset.commentsLabel || 'feed-comment'
  };

  const sourcesUrl = 'data/sources.json';
  let posts = [];
  let sourceErrors = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let visibleMediaItems = [];
  let viewerIndex = 0;
  const viewer = createMediaViewer();

  initTheme();
  initAmbientCanvas();
  loadSocialFeed();

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      filterButtons.forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      currentFilter = button.dataset.filter || 'all';
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', event => {
      searchQuery = event.target.value;
      applyFilters();
    });
  }

  async function loadSocialFeed() {
    renderLoadingState();

    try {
      const sources = await fetchJson(sourcesUrl);
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

      updateStats(posts);
      applyFilters();
    } catch (error) {
      console.error(error);
      posts = [];
      sourceErrors = [{ id: 'feed-config', title: 'Feed configuration', message: error.message }];
      updateStats(posts);
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
      throw new Error(`${url} 응답 오류: ${response.status}`);
    }
    return response.json();
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

  function updateStats(postList) {
    const projectIds = new Set(postList.map(post => post.project.id));
    const visualCount = postList.reduce((count, post) => count + post.media.filter(isVisualMedia).length, 0);
    const demoCount = postList.filter(post => post.type === 'embed' || post.media.some(item => item.type === 'video')).length;

    statTotal.textContent = postList.length;
    statPublished.textContent = projectIds.size;
    statDraft.textContent = visualCount;
    statArchived.textContent = demoCount;
  }

  function applyFilters() {
    const query = searchQuery.trim().toLowerCase();
    let filteredPosts = posts;

    if (currentFilter !== 'all') {
      filteredPosts = filteredPosts.filter(post => matchesFilter(post, currentFilter));
    }

    if (query) {
      filteredPosts = filteredPosts.filter(post => {
        const searchable = [
          post.project.title,
          post.project.description,
          post.title,
          post.text,
          post.date,
          post.type,
          ...post.tags
        ].join(' ').toLowerCase();

        return searchable.includes(query);
      });
    }

    renderFeed(filteredPosts);
  }

  function matchesFilter(post, filter) {
    if (filter === 'image') return ['image', 'gallery'].includes(post.type);
    if (filter === 'gif') return post.type === 'gif' || post.media.some(item => item.type === 'gif');
    if (filter === 'video') return post.type === 'video' || post.media.some(item => item.type === 'video');
    if (filter === 'embed') return post.type === 'embed';
    return post.type === filter;
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
    card.className = `post-card ${escapeAttribute(post.type)}`;
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
        ${post.text ? `<p class="post-description">${escapeHtml(post.text)}</p>` : ''}
        ${renderCompactTags(post.tags)}
      </div>

      <div class="post-actions" aria-label="포스트 작업">
        ${renderLinkButton(post.url, '열기', 'primary')}
        ${renderLinkButton(post.project.sourceUrl, '소스')}
        <button class="action-button comments-toggle" type="button" aria-expanded="false" aria-controls="${commentPanelId}">댓글</button>
      </div>

      <div class="comments-panel" id="${commentPanelId}" hidden></div>
    `;

    card.querySelectorAll('.media-slide img, .gallery-grid img').forEach(image => {
      image.addEventListener('error', () => {
        image.replaceWith(createFallbackElement(post.title));
      });
    });

    card.querySelectorAll('[data-viewer-index]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.viewerIndex);
        if (Number.isInteger(index) && index >= 0) {
          openViewer(index);
        }
      });
    });

    const commentsButton = card.querySelector('.comments-toggle');
    const commentsPanel = card.querySelector('.comments-panel');
    commentsButton.addEventListener('click', () => {
      const isExpanded = commentsButton.getAttribute('aria-expanded') === 'true';
      commentsButton.setAttribute('aria-expanded', String(!isExpanded));
      commentsPanel.hidden = isExpanded;

      if (!isExpanded && !commentsPanel.dataset.loaded) {
        loadComments(post, commentsPanel);
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

    if (post.type === 'gallery' && mediaItems.length > 0) {
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
      <div class="media-showcase gallery-showcase" style="--gallery-tile-min: ${getGalleryTileMin(mediaItems.length)}">
        <div class="gallery-header">
          <span class="status-pill ${escapeAttribute(post.type)}">${getTypeLabel(post.type)}</span>
          <span>${mediaItems.length}장</span>
        </div>
        <div class="gallery-grid" aria-label="${escapeAttribute(post.title)} 미디어 그리드">
          ${mediaItems.map(({ item, mediaIndex }, displayIndex) => renderGalleryTile(item, post, mediaIndex, displayIndex, mediaItems.length)).join('')}
        </div>
      </div>
    `;
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

  function getGalleryTileMin(count) {
    if (count <= 2) return '168px';
    if (count <= 4) return '140px';
    if (count <= 9) return '112px';
    return '88px';
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

  function renderLinkButton(url, label, variant = '') {
    if (!url || url === '#') {
      return `<span class="action-button disabled" aria-disabled="true">${escapeHtml(label)}</span>`;
    }

    const external = /^https?:\/\//i.test(url);
    return `
      <a class="action-button ${escapeAttribute(variant)}" href="${escapeAttribute(url)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>
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

  function loadComments(post, container) {
    container.dataset.loaded = 'true';
    container.innerHTML = '';

    if (!commentConfig.repo) {
      container.innerHTML = `
        <p class="comments-note">
          댓글 저장소가 설정되지 않았습니다. <code>body[data-comments-repo]</code>에 GitHub 저장소를 지정해 주세요.
        </p>
      `;
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
          <div class="viewer-actions">
            <a class="viewer-link" href="#" target="_blank" rel="noopener noreferrer">원본</a>
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

    closeButton.addEventListener('click', closeViewer);
    prevButton.addEventListener('click', () => moveViewer(-1));
    nextButton.addEventListener('click', () => moveViewer(1));

    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeViewer();
    });

    dialog.addEventListener('close', () => {
      document.body.classList.remove('viewer-open');
    });

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

    stage.addEventListener('touchstart', event => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });

    stage.addEventListener('touchend', event => {
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        moveViewer(deltaX < 0 ? 1 : -1);
      }
    }, { passive: true });

    return dialog;
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

    const stage = viewer.querySelector('.viewer-stage');
    const title = viewer.querySelector('.viewer-title');
    const meta = viewer.querySelector('.viewer-meta');
    const link = viewer.querySelector('.viewer-link');
    const navButtons = viewer.querySelectorAll('.viewer-nav');
    const mediaLabel = escapeAttribute(item.alt || item.postTitle);

    stage.innerHTML = item.type === 'video'
      ? `
        <video controls autoplay playsinline ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ''}>
          <source src="${escapeAttribute(item.url)}">
        </video>
      `
      : `<img src="${escapeAttribute(item.url)}" alt="${mediaLabel}">`;

    title.textContent = item.postTitle;
    meta.textContent = [
      `${viewerIndex + 1} / ${visibleMediaItems.length}`,
      item.projectTitle,
      item.date ? formatDate(item.date) : ''
    ].filter(Boolean).join(' · ');

    if (item.postUrl && item.postUrl !== '#') {
      link.href = item.postUrl;
      link.hidden = false;
    } else {
      link.hidden = true;
    }

    viewer.classList.toggle('is-single', visibleMediaItems.length < 2);
    navButtons.forEach(button => {
      button.disabled = visibleMediaItems.length < 2;
    });
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
      <h2>${hasWarnings ? '표시할 포스트가 없습니다' : '검색 결과가 없습니다'}</h2>
      <p>${hasWarnings ? '연결된 공개 피드 URL과 GitHub Pages 배포 상태를 확인해 주세요.' : '검색어를 바꾸거나 다른 미디어 필터를 선택해 주세요.'}</p>
      <button class="reset-btn" type="button" id="reset-filters-btn">필터 초기화</button>
    `;
    feedContainer.appendChild(emptyState);

    document.getElementById('reset-filters-btn')?.addEventListener('click', () => {
      currentFilter = 'all';
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      filterButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.filter === 'all');
      });
      applyFilters();
    });
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
