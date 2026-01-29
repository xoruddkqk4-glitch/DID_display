// 간단한 로컬 스토리지 키
const STORAGE_KEY = "board_posts_with_period";

// 첨부파일 최대 크기 (2MB)
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;

/**
 * 저장된 게시물 목록 불러오기
 */
function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.error("Failed to load posts from storage", e);
    return [];
  }
}

/**
 * 게시물 목록 저장하기
 * @param {Array} posts
 */
function savePosts(posts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch (e) {
    console.error("Failed to save posts to storage", e);
  }
}

/**
 * 게시 상태 계산 (예: 진행중, 예정, 종료)
 */
function getPostStatus(startDate, endDate) {
  if (!startDate || !endDate) return { code: "unknown", label: "기간 미설정" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const s = new Date(startDate);
  const e = new Date(endDate);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);

  if (today < s) {
    return { code: "pending", label: "게시 예정" };
  }
  if (today > e) {
    return { code: "expired", label: "게시 종료" };
  }
  return { code: "active", label: "게시 중" };
}

/**
 * 게시 기간 텍스트
 */
function formatPeriod(startDate, endDate) {
  if (!startDate || !endDate) return "기간 정보 없음";
  return `${startDate} ~ ${endDate}`;
}

/**
 * 첨부파일을 base64로 읽기 (Promise)
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1] || "";
      resolve({ fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64: base64 });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * 단일 게시물 DOM 요소 생성
 */
function createPostElement(post, index, onDelete) {
  const status = getPostStatus(post.startDate, post.endDate);

  const container = document.createElement("article");
  container.className = "post-item";
  container.dataset.index = String(index);

  const header = document.createElement("div");
  header.className = "post-header";

  const title = document.createElement("div");
  title.className = "post-title";
  title.textContent = post.title || "(제목 없음)";

  const rightHeader = document.createElement("div");
  rightHeader.style.display = "flex";
  rightHeader.style.alignItems = "center";
  rightHeader.style.gap = "6px";

  const authorBadge = document.createElement("span");
  authorBadge.className = "badge badge-author";
  authorBadge.textContent = post.author || "익명";

  const statusSpan = document.createElement("span");
  statusSpan.className = `post-status ${status.code}`;
  statusSpan.textContent = status.label;

  rightHeader.appendChild(authorBadge);
  rightHeader.appendChild(statusSpan);

  header.appendChild(title);
  header.appendChild(rightHeader);

  const content = document.createElement("div");
  content.className = "post-content";
  content.textContent = post.content || "(내용 없음)";

  const period = document.createElement("div");
  period.className = "post-period";
  period.textContent = `게시 기간: ${formatPeriod(post.startDate, post.endDate)}`;

  if (post.attachment && post.attachment.fileName) {
    const att = document.createElement("div");
    att.className = "post-attachment";
    const a = document.createElement("a");
    a.href = "data:" + (post.attachment.mimeType || "") + ";base64," + (post.attachment.dataBase64 || "");
    a.download = post.attachment.fileName;
    a.textContent = "📎 " + post.attachment.fileName;
    att.appendChild(a);
    container.appendChild(header);
    container.appendChild(content);
    container.appendChild(period);
    container.appendChild(att);
  } else {
    container.appendChild(header);
    container.appendChild(content);
    container.appendChild(period);
  }

  const footer = document.createElement("div");
  footer.className = "post-footer";

  const createdAt = document.createElement("span");
  createdAt.className = "post-meta";
  createdAt.textContent = `등록일: ${post.createdAt || "-"}`;

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "post-delete";
  deleteBtn.textContent = "삭제";
  deleteBtn.addEventListener("click", () => {
    onDelete(index);
  });

  footer.appendChild(createdAt);
  footer.appendChild(deleteBtn);

  container.appendChild(footer);

  return container;
}

/**
 * 게시물 목록 렌더링
 */
function renderPosts(posts) {
  const listEl = document.getElementById("post-list");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!posts.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "아직 등록된 게시물이 없습니다. 위 폼을 이용해 첫 게시물을 등록해 보세요.";
    listEl.appendChild(empty);
    return;
  }

  posts.forEach((post, index) => {
    const item = createPostElement(post, index, (idx) => {
      const newPosts = [...posts];
      newPosts.splice(idx, 1);
      savePosts(newPosts);
      renderPosts(newPosts);
      renderGanttChart(newPosts);
    });
    listEl.appendChild(item);
  });

  renderGanttChart(posts);
}

/**
 * 게시물 목록에서 날짜 범위 계산 (간트 차트용)
 */
function getDateRange(posts) {
  let min = null;
  let max = null;
  posts.forEach((p) => {
    if (p.startDate) {
      const d = new Date(p.startDate);
      if (min === null || d < min) min = d;
    }
    if (p.endDate) {
      const d = new Date(p.endDate);
      if (max === null || d > max) max = d;
    }
  });
  if (min === null || max === null || min > max) return null;
  const pad = (max - min) * 0.05 || 86400000 * 7;
  return { min: new Date(min.getTime() - pad), max: new Date(max.getTime() + pad) };
}

/**
 * 간트 차트 렌더링
 */
function renderGanttChart(posts) {
  const el = document.getElementById("gantt-chart");
  if (!el) return;

  el.innerHTML = "";

  const withDates = (posts || []).filter((p) => p.startDate && p.endDate);
  if (withDates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "gantt-empty";
    empty.textContent = "게시 기간이 있는 게시물이 없습니다. 게시물을 등록하면 여기에 표시됩니다.";
    el.appendChild(empty);
    return;
  }

  const range = getDateRange(withDates);
  if (!range) return;

  const totalMs = range.max - range.min;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPct =
    today >= range.min && today <= range.max
      ? ((today - range.min) / totalMs) * 100
      : null;

  const header = document.createElement("div");
  header.className = "gantt-timeline-header";

  const labelHeader = document.createElement("div");
  labelHeader.className = "gantt-label-header";
  labelHeader.textContent = "게시물";

  const datesHeader = document.createElement("div");
  datesHeader.className = "gantt-dates-header";
  const startStr = range.min.toISOString().slice(0, 10);
  const endStr = range.max.toISOString().slice(0, 10);
  datesHeader.textContent = `${startStr} ~ ${endStr}`;
  datesHeader.style.display = "flex";
  datesHeader.style.alignItems = "center";
  datesHeader.style.paddingLeft = "8px";
  datesHeader.style.fontSize = "0.78rem";
  datesHeader.style.color = "#64748b";

  header.appendChild(labelHeader);
  header.appendChild(datesHeader);
  el.appendChild(header);

  const body = document.createElement("div");
  body.className = "gantt-timeline-body";

  if (todayPct !== null) {
    const todayLine = document.createElement("div");
    todayLine.className = "gantt-today-line";
    todayLine.style.left = todayPct + "%";
    body.appendChild(todayLine);
  }

  withDates.forEach((post) => {
    const row = document.createElement("div");
    row.className = "gantt-row";

    const label = document.createElement("div");
    label.className = "gantt-row-label";
    label.title = (post.title || "") + " · " + (post.author || "");
    label.textContent = (post.title || "(제목 없음)") + " · " + (post.author || "익명");

    const barWrap = document.createElement("div");
    barWrap.className = "gantt-row-bar-wrap";

    const start = new Date(post.startDate).getTime();
    const end = new Date(post.endDate).getTime();
    const leftPct = ((start - range.min) / totalMs) * 100;
    const widthPct = ((end - start) / totalMs) * 100;

    const bar = document.createElement("div");
    bar.className = "gantt-bar " + getPostStatus(post.startDate, post.endDate).code;
    bar.style.left = leftPct + "%";
    bar.style.width = Math.max(widthPct, 2) + "%";
    bar.title = post.startDate + " ~ " + post.endDate;

    barWrap.appendChild(bar);
    row.appendChild(label);
    row.appendChild(barWrap);
    body.appendChild(row);
  });

  el.appendChild(body);
}

/**
 * 폼 초기화 및 이벤트 설정
 */
function initApp() {
  const form = document.getElementById("post-form");
  const clearAllBtn = document.getElementById("clear-all");

  if (!form) return;

  // 오늘 날짜를 기본값으로 설정
  const startInput = document.getElementById("startDate");
  const endInput = document.getElementById("endDate");
  const todayStr = new Date().toISOString().slice(0, 10);
  if (startInput && !startInput.value) startInput.value = todayStr;
  if (endInput && !endInput.value) endInput.value = todayStr;

  // 기존 게시물 렌더링
  let posts = loadPosts();
  renderPosts(posts);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const author = (formData.get("author") || "").toString().trim();
    const title = (formData.get("title") || "").toString().trim();
    const content = (formData.get("content") || "").toString().trim();
    const startDate = (formData.get("startDate") || "").toString();
    const endDate = (formData.get("endDate") || "").toString();
    const fileInput = form.querySelector("#attachment");

    if (!author || !title || !startDate || !endDate) {
      alert("작성자, 제목, 게시 시작일, 게시 종료일은 필수입니다.");
      return;
    }

    if (endDate < startDate) {
      alert("게시 종료일은 게시 시작일보다 빠를 수 없습니다.");
      return;
    }

    let attachment = null;
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (file.size > MAX_ATTACHMENT_SIZE) {
        alert("첨부파일은 최대 2MB까지 가능합니다.");
        return;
      }
      try {
        attachment = await readFileAsBase64(file);
      } catch (e) {
        alert("첨부파일을 읽는 중 오류가 발생했습니다.");
        return;
      }
    }

    const createdAt = new Date().toISOString().slice(0, 10);

    const newPost = {
      id: Date.now(),
      author,
      title,
      content,
      startDate,
      endDate,
      createdAt,
      attachment: attachment || undefined,
    };

    posts = [newPost, ...posts];
    savePosts(posts);
    renderPosts(posts);

    form.querySelector("#title").value = "";
    form.querySelector("#content").value = "";
    if (fileInput) fileInput.value = "";
  });

  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      if (!confirm("모든 게시물을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
      posts = [];
      savePosts(posts);
      renderPosts(posts);
      renderGanttChart(posts);
    });
  }
}

document.addEventListener("DOMContentLoaded", initApp);