document.addEventListener('DOMContentLoaded', () => {
  const feedContainer = document.getElementById('projects-feed');
  const searchInput = document.getElementById('search-input');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const statTotal = document.getElementById('stat-total');
  const statPublished = document.getElementById('stat-published');
  const statDraft = document.getElementById('stat-draft');
  const statArchived = document.getElementById('stat-archived');
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
        return a.title.localeCompare(b.title, 'ko');
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
    const visualCount = postList.filter(post => ['image', 'gallery', 'gif'].includes(post.type)).length;
    const demoCount = postList.filter(post => post.type === 'embed' || post.type === 'video').length;

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

    sourceErrors.forEach(error => {
      feedContainer.appendChild(createNoticeCard(error));
    });

    if (postList.length === 0) {
      renderEmptyState();
      return;
    }

    postList.forEach(post => {
      feedContainer.appendChild(createPostCard(post));
    });
  }

  function createPostCard(post) {
    const card = document.createElement('article');
    card.className = `post-card ${escapeAttribute(post.type)}`;

    const commentPanelId = `comments-${post.project.id}-${post.id}`;

    card.innerHTML = `
      <header class="post-header">
        <div class="post-avatar" aria-hidden="true">${getInitial(post.project.title)}</div>
        <div class="post-meta">
          <div class="post-author-row">
            <span class="post-author">${escapeHtml(post.project.title)}</span>
            <span class="status-pill ${escapeAttribute(post.type)}">${getTypeLabel(post.type)}</span>
          </div>
          <div class="post-time">${post.date ? `${formatDate(post.date)} · ` : ''}${escapeHtml(post.tags.slice(0, 3).join(' · '))}</div>
        </div>
      </header>

      <div class="post-body">
        <h2 class="post-title">${escapeHtml(post.title)}</h2>
        <p class="post-description">${escapeHtml(post.text)}</p>
        ${renderTags(post.tags)}
      </div>

      ${renderMedia(post)}

      <div class="post-actions">
        ${renderLinkButton(post.url, '보기', 'primary')}
        ${renderLinkButton(post.project.pageUrl, '프로젝트')}
        ${renderLinkButton(post.project.sourceUrl, '소스')}
        <button class="action-button comments-toggle" type="button" aria-expanded="false" aria-controls="${commentPanelId}">댓글</button>
      </div>

      <div class="comments-panel" id="${commentPanelId}" hidden></div>
    `;

    card.querySelectorAll('.post-media img, .media-grid img').forEach(image => {
      image.addEventListener('error', () => {
        image.replaceWith(createFallbackElement(post.title));
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
        <div class="post-media embed-media">
          <iframe src="${escapeAttribute(embed.url)}" title="${escapeAttribute(embed.title || post.title)}" loading="lazy" allowfullscreen></iframe>
        </div>
      `;
    }

    if (post.type === 'video' && post.media[0]) {
      const video = post.media[0];
      return `
        <div class="post-media video-media">
          <video controls playsinline ${video.poster ? `poster="${escapeAttribute(video.poster)}"` : ''}>
            <source src="${escapeAttribute(video.url)}">
          </video>
        </div>
      `;
    }

    if (post.media.length > 1 || post.type === 'gallery' || post.type === 'gif') {
      return `
        <div class="media-grid ${post.media.length === 1 ? 'single' : ''}">
          ${post.media.map(item => renderMediaItem(item, post.title)).join('')}
        </div>
      `;
    }

    if (post.media[0]) {
      const image = post.media[0];
      return `
        <div class="post-media">
          <img src="${escapeAttribute(image.url)}" alt="${escapeAttribute(image.alt || post.title)}" loading="lazy">
        </div>
      `;
    }

    return `
      <div class="post-media">
        ${renderFallback(post.title)}
      </div>
    `;
  }

  function renderMediaItem(item, fallbackTitle) {
    if (item.type === 'video') {
      return `
        <div class="media-item">
          <video controls playsinline ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ''}>
            <source src="${escapeAttribute(item.url)}">
          </video>
        </div>
      `;
    }

    return `
      <div class="media-item">
        <img src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.alt || fallbackTitle)}" loading="lazy">
      </div>
    `;
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

  function renderTags(tags = []) {
    if (!Array.isArray(tags) || tags.length === 0) return '';
    return `
      <div class="tag-list" aria-label="태그">
        ${tags.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
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

  function renderLoadingState() {
    if (!feedContainer) return;
    feedContainer.innerHTML = `
      <section class="empty-state">
        <h2>피드를 불러오는 중입니다</h2>
        <p>공개 프로젝트의 소셜 포스트를 모으고 있습니다.</p>
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
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  function getInitial(value) {
    return String(value || 'G').trim().charAt(0).toUpperCase();
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
