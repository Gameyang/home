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

  let projects = [];
  let currentFilter = 'all';
  let searchQuery = '';

  fetch('data/projects.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('프로젝트 데이터를 불러오지 못했습니다.');
      }
      return response.json();
    })
    .then(data => {
      projects = Array.isArray(data) ? data : [];
      updateStats(projects);
      applyFilters();
    })
    .catch(error => {
      console.error(error);
      renderErrorState(error.message);
    });

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

  function updateStats(projectList) {
    const totalCount = projectList.length;
    const publishedCount = projectList.filter(project => project.status === 'published').length;
    const draftCount = projectList.filter(project => project.status === 'draft').length;
    const archivedCount = projectList.filter(project => project.status === 'archived').length;

    statTotal.textContent = totalCount;
    statPublished.textContent = publishedCount;
    statDraft.textContent = draftCount;
    statArchived.textContent = archivedCount;
  }

  function applyFilters() {
    const query = searchQuery.trim().toLowerCase();
    let filteredProjects = projects;

    if (currentFilter !== 'all') {
      filteredProjects = filteredProjects.filter(project => project.status === currentFilter);
    }

    if (query) {
      filteredProjects = filteredProjects.filter(project => {
        const searchable = [
          project.title,
          project.description,
          project.week,
          project.type,
          ...(project.tags || [])
        ].join(' ').toLowerCase();

        return searchable.includes(query);
      });
    }

    renderFeed(filteredProjects);
  }

  function renderFeed(projectList) {
    if (!feedContainer) return;

    feedContainer.innerHTML = '';

    if (projectList.length === 0) {
      renderEmptyState();
      return;
    }

    projectList.forEach(project => {
      feedContainer.appendChild(createPostCard(project));
    });
  }

  function createPostCard(project) {
    const card = document.createElement('article');
    card.className = `post-card ${escapeAttribute(project.status || '')}`;

    const isOpenable = project.status !== 'draft' && project.url && project.url !== '#';
    const commentPanelId = `comments-${slugify(project.id || project.title)}`;

    card.innerHTML = `
      <header class="post-header">
        <div class="post-avatar" aria-hidden="true">${getInitial(project.author || project.title)}</div>
        <div class="post-meta">
          <div class="post-author-row">
            <span class="post-author">${escapeHtml(project.author || 'Gameyang')}</span>
            <span class="status-pill ${escapeAttribute(project.status || 'draft')}">${getStatusLabel(project.status)}</span>
          </div>
          <div class="post-time">${escapeHtml(project.week || '')}${project.date ? ` · ${formatDate(project.date)}` : ''}${project.type ? ` · ${escapeHtml(project.type)}` : ''}</div>
        </div>
      </header>

      <div class="post-body">
        <h2 class="post-title">${escapeHtml(project.title || 'Untitled project')}</h2>
        <p class="post-description">${escapeHtml(project.description || '')}</p>
        ${renderTags(project.tags)}
      </div>

      <div class="post-media">
        ${project.thumbnail ? `
          <img src="${escapeAttribute(project.thumbnail)}" alt="${escapeAttribute(project.title || '프로젝트 썸네일')}" loading="lazy">
        ` : renderFallback(project.title)}
      </div>

      <div class="post-actions">
        ${isOpenable ? `
          <a class="action-button primary" href="${escapeAttribute(project.url)}">프로젝트 보기</a>
        ` : `
          <span class="action-button disabled" aria-disabled="true">${project.status === 'draft' ? '준비 중' : '링크 없음'}</span>
        `}
        ${project.source ? `
          <a class="action-button" href="${escapeAttribute(project.source)}" target="_blank" rel="noopener noreferrer">소스</a>
        ` : `
          <span class="action-button disabled" aria-disabled="true">소스 없음</span>
        `}
        <button class="action-button comments-toggle" type="button" aria-expanded="false" aria-controls="${commentPanelId}">댓글</button>
      </div>

      <div class="comments-panel" id="${commentPanelId}" hidden></div>
    `;

    const image = card.querySelector('.post-media img');
    if (image) {
      image.addEventListener('error', () => {
        image.replaceWith(createFallbackElement(project.title));
      });
    }

    const commentsButton = card.querySelector('.comments-toggle');
    const commentsPanel = card.querySelector('.comments-panel');
    commentsButton.addEventListener('click', () => {
      const isExpanded = commentsButton.getAttribute('aria-expanded') === 'true';
      commentsButton.setAttribute('aria-expanded', String(!isExpanded));
      commentsPanel.hidden = isExpanded;

      if (!isExpanded && !commentsPanel.dataset.loaded) {
        loadComments(project, commentsPanel);
      }
    });

    return card;
  }

  function loadComments(project, container) {
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
    script.setAttribute('issue-term', `feed-${project.id || slugify(project.title)}`);
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

  function renderEmptyState() {
    feedContainer.innerHTML = `
      <section class="empty-state">
        <h2>검색 결과가 없습니다</h2>
        <p>검색어를 바꾸거나 다른 상태 필터를 선택해 주세요.</p>
        <button class="reset-btn" type="button" id="reset-filters-btn">필터 초기화</button>
      </section>
    `;

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

  function getStatusLabel(status) {
    const labels = {
      published: '공개',
      draft: '작업중',
      archived: '보관'
    };
    return labels[status] || '상태 미정';
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
