const state = {
  storyData: null,
  characters: [],
  characterMap: new Map(),
  currentChapterIndex: 0,
  currentSectionIndex: 0,
  currentShipSectionId: null,
  currentSpeakerId: null
};

const elements = {};

const RANK_AND_FILE = [
  {
    title: "Палубные техники",
    subtitle: "Ремонт, обслуживание, аварийные работы",
    text: "Это не герои для плаката, а те, кто держит силовые магистрали, стартовые рельсы, шлюзы, фиксаторы, краны и сотни малых систем в рабочем состоянии."
  },
  {
    title: "Сменные пилоты",
    subtitle: "Патрули, сопровождение, перехват",
    text: "Помимо Arclance, у корабля должны ощущаться обычные пилоты звеньев: менее яркие, но очень нужные, с разной степенью износа и опыта."
  },
  {
    title: "Корабельная охрана",
    subtitle: "Внутренний периметр и рейдовые группы",
    text: "Не только Bastion. Нужны обычные тяжёлые и средние охранники, которые сопровождают добывающие рейды, караулят архивы и дежурят на критических палубах."
  },
  {
    title: "Медицинский и сервисный состав",
    subtitle: "Стазис, стабилизация, эвакуация",
    text: "Lifeline не должна выглядеть как единственный медик на корабле. Ей нужен хотя бы намёк на команду помощников, носителей и операторов медкапсул."
  }
];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();

  try {
    const [storyMeta, characters, storyMarkdown] = await Promise.all([
      fetchJson("data/story.json"),
      fetchJson("data/characters.json"),
      fetchText("data/egida_avangarda_full.md")
    ]);

    state.characters = characters;
    state.characterMap = new Map(characters.map((character) => [character.id, character]));
    state.storyData = mergeStoryData(storyMeta, parseStoryMarkdown(storyMarkdown));
    state.currentShipSectionId = state.storyData.shipSections[0]?.sectionId || null;
    state.currentSpeakerId = state.storyData.chapters[0]?.focusCharacterIds[0] || state.characters[0]?.id || null;

    hydrateHero();
    renderChapterRail();
    renderShipSections();
    renderCrew();
    renderRankAndFile();
    renderMissionLog();
    selectChapter(0, 0);
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `
      <main style="padding: 2rem; color: #edf5ff; font-family: Segoe UI, sans-serif;">
        <h1>Не удалось загрузить данные сайта</h1>
        <p>Проверьте, что проект открыт через локальный сервер, а JSON и Markdown-файлы лежат на месте.</p>
        <pre>${escapeHtml(String(error.message || error))}</pre>
      </main>
    `;
  }
}

function cacheElements() {
  const ids = [
    "heroStartBtn",
    "heroCrewBtn",
    "heroJournalBtn",
    "heroLogline",
    "activeCount",
    "recoveringCount",
    "stasisCount",
    "shipLocation",
    "chapterRail",
    "chapterCounter",
    "chapterTitle",
    "sceneTitle",
    "chapterIntro",
    "sceneBackground",
    "sceneMood",
    "chapterStats",
    "chapterMeta",
    "focusCharacterStrip",
    "focusLabel",
    "sectionProgressLabel",
    "sectionTabs",
    "storyReader",
    "prevChapterBtn",
    "nextChapterBtn",
    "speakerSpotlight",
    "storyLorePanel",
    "shipSectionCards",
    "shipSectionDetail",
    "crewGrid",
    "rankCrewGrid",
    "missionLog"
  ];

  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.heroStartBtn.addEventListener("click", () => {
    scrollToSection("storySection");
    selectChapter(0, 0);
  });
  elements.heroCrewBtn.addEventListener("click", () => scrollToSection("crewSection"));
  elements.heroJournalBtn.addEventListener("click", () => scrollToSection("journalSection"));
  elements.prevChapterBtn.addEventListener("click", goToPreviousChapter);
  elements.nextChapterBtn.addEventListener("click", goToNextChapter);
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  }
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  }
  return response.text();
}

function parseStoryMarkdown(markdown) {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const chapters = [];
  let storyTitle = "";
  let currentChapter = null;
  let currentSection = null;
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (!currentSection) {
      paragraphBuffer = [];
      return;
    }

    const text = paragraphBuffer
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    paragraphBuffer = [];

    if (!text) {
      return;
    }

    const isQuote = text.startsWith("*") && text.endsWith("*") && text.length > 2;
    currentSection.blocks.push({
      type: isQuote ? "quote" : "paragraph",
      text: isQuote ? text.slice(1, -1).trim() : text
    });
  };

  const openChapter = (title) => {
    flushParagraph();
    currentChapter = { title, sections: [] };
    chapters.push(currentChapter);
    currentSection = null;
  };

  const openSection = (title) => {
    flushParagraph();
    if (!currentChapter) return;
    currentSection = { title, blocks: [] };
    currentChapter.sections.push(currentSection);
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();

    if (/^#\s+/.test(line)) {
      flushParagraph();
      if (!storyTitle) {
        storyTitle = line.replace(/^#\s+/, "").trim();
      }
      return;
    }

    if (/^##\s+/.test(line)) {
      openChapter(line.replace(/^##\s+/, "").trim());
      return;
    }

    if (/^###\s+/.test(line)) {
      openSection(line.replace(/^###\s+/, "").trim());
      return;
    }

    if (line.trim() === "---") {
      flushParagraph();
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      return;
    }

    if (currentSection) {
      paragraphBuffer.push(line);
    }
  });

  flushParagraph();

  return {
    title: storyTitle,
    chapters
  };
}

function mergeStoryData(storyMeta, markdownStory) {
  const metaByTitle = new Map(
    storyMeta.chapters.map((chapter) => [normalizeText(chapter.title), chapter])
  );

  const chapters = markdownStory.chapters.map((chapter, chapterIndex) => {
    const meta =
      metaByTitle.get(normalizeText(chapter.title)) || storyMeta.chapters[chapterIndex] || {};
    const chapterId = meta.chapterId || `chapter_${String(chapterIndex + 1).padStart(2, "0")}`;
    const firstParagraph =
      chapter.sections
        .flatMap((section) => section.blocks)
        .find((block) => block.type === "paragraph")?.text || "";

    const sections = chapter.sections.map((section, sectionIndex) => ({
      ...section,
      sectionId: `${chapterId}_section_${String(sectionIndex + 1).padStart(2, "0")}`,
      preview:
        section.blocks.find((block) => block.type === "paragraph" || block.type === "quote")?.text ||
        ""
    }));

    const fullText = sections.flatMap((section) => section.blocks.map((block) => block.text)).join(" ");
    const wordCount = countWords(fullText);
    const paragraphCount = sections.reduce(
      (sum, section) => sum + section.blocks.filter((block) => block.type === "paragraph").length,
      0
    );
    const focusCharacterIds = detectCharacterIds(fullText, meta.focusCharacterIds || []);

    return {
      chapterId,
      title: chapter.title,
      shortTitle: meta.shortTitle || stripChapterPrefix(chapter.title),
      backgroundImage: meta.backgroundImage || storyMeta.shipSections[0]?.image || "",
      mood: meta.mood || "Дальний эфир",
      summary: meta.summary || firstParagraph,
      dossier: meta.dossier || [],
      focusCharacterIds,
      sections,
      wordCount,
      paragraphCount,
      estimatedMinutes: Math.max(1, Math.ceil(wordCount / 180))
    };
  });

  return {
    ...storyMeta,
    title: markdownStory.title || storyMeta.title,
    chapters
  };
}

function hydrateHero() {
  elements.heroLogline.textContent = state.storyData.logline;
  elements.activeCount.textContent = state.storyData.crewStatus.active;
  elements.recoveringCount.textContent = state.storyData.crewStatus.recovering;
  elements.stasisCount.textContent = state.storyData.crewStatus.stasis;
  elements.shipLocation.textContent = state.storyData.crewStatus.location;
}

function renderChapterRail() {
  elements.chapterRail.innerHTML = "";

  state.storyData.chapters.forEach((chapter, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-button";
    button.innerHTML = `
      <small>Глава ${String(index + 1).padStart(2, "0")}</small>
      <strong>${escapeHtml(chapter.shortTitle)}</strong>
      <p>${escapeHtml(truncateText(chapter.summary, 120))}</p>
      <span class="chapter-inline-meta">${chapter.sections.length} разделов • ~${chapter.estimatedMinutes} мин</span>
    `;
    button.addEventListener("click", () => selectChapter(index, 0));
    elements.chapterRail.appendChild(button);
  });
}

function renderSectionTabs() {
  const chapter = getCurrentChapter();
  elements.sectionTabs.innerHTML = "";

  chapter.sections.forEach((section, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "section-tab";
    button.innerHTML = `
      <small>Раздел ${index + 1}</small>
      <strong>${escapeHtml(section.title)}</strong>
      <p>${escapeHtml(truncateText(section.preview, 78))}</p>
    `;
    button.addEventListener("click", () => selectSection(index, true));
    elements.sectionTabs.appendChild(button);
  });
}

function renderCurrentChapter() {
  const chapter = getCurrentChapter();
  const currentSection = getCurrentSection();

  elements.chapterCounter.textContent = `${state.currentChapterIndex + 1} / ${state.storyData.chapters.length}`;
  elements.chapterTitle.textContent = chapter.title;
  elements.sceneTitle.textContent = chapter.shortTitle;
  elements.chapterIntro.textContent = chapter.summary;
  elements.sceneMood.textContent = chapter.mood;
  elements.sceneBackground.src = chapter.backgroundImage;
  elements.sceneBackground.alt = chapter.title;
  elements.prevChapterBtn.disabled = state.currentChapterIndex === 0;
  elements.nextChapterBtn.disabled = state.currentChapterIndex === state.storyData.chapters.length - 1;
  elements.focusLabel.textContent = `${chapter.focusCharacterIds.length} фигур главы`;
  elements.sectionProgressLabel.textContent = `Активный раздел: ${currentSection?.title || "—"}`;

  renderChapterStats();
  renderChapterMeta();
  renderFocusCharacterStrip();
  renderSectionTabs();
  renderStoryReader();
  updateSpeakerSpotlight();
  renderLorePanel();
  updateChapterSelection();
  updateSectionSelection();
  updateActiveHighlights();
}

function renderChapterStats() {
  const chapter = getCurrentChapter();
  elements.chapterStats.innerHTML = `
    <div class="stat-pill">
      <small>Разделы</small>
      <strong>${chapter.sections.length}</strong>
    </div>
    <div class="stat-pill">
      <small>Слова</small>
      <strong>${formatNumber(chapter.wordCount)}</strong>
    </div>
    <div class="stat-pill">
      <small>Чтение</small>
      <strong>~${chapter.estimatedMinutes} мин</strong>
    </div>
  `;
}

function renderChapterMeta() {
  const chapter = getCurrentChapter();
  const metaItems = [
    { label: "Режим", value: "Полный текст" },
    { label: "Фокус", value: `${chapter.focusCharacterIds.length} персонажей` },
    { label: "Атмосфера", value: chapter.mood }
  ];

  elements.chapterMeta.innerHTML = metaItems
    .map(
      (item) => `
        <div class="meta-chip">
          <small>${escapeHtml(item.label)}</small>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderFocusCharacterStrip() {
  const chapter = getCurrentChapter();
  const ids = chapter.focusCharacterIds.length ? chapter.focusCharacterIds : [state.characters[0]?.id].filter(Boolean);

  elements.focusCharacterStrip.innerHTML = ids
    .map((characterId) => {
      const character = state.characterMap.get(characterId);
      if (!character) return "";

      return `
        <button class="focus-character-button" type="button" data-character-id="${escapeAttribute(character.id)}">
          <img src="${escapeAttribute(character.spotlightPortrait || character.portrait)}" alt="${escapeAttribute(character.name)}" />
          <span>
            <strong>${escapeHtml(character.name)}</strong>
            <small>${escapeHtml(character.role)}</small>
          </span>
        </button>
      `;
    })
    .join("");

  elements.focusCharacterStrip.querySelectorAll(".focus-character-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentSpeakerId = button.dataset.characterId;
      updateSpeakerSpotlight();
      renderLorePanel();
      updateActiveHighlights();
    });
  });
}

function renderStoryReader() {
  const chapter = getCurrentChapter();

  elements.storyReader.innerHTML = chapter.sections
    .map((section, index) => {
      const blocks = section.blocks
        .map((block) => {
          if (block.type === "quote") {
            return `<blockquote class="reader-quote">${escapeHtml(block.text)}</blockquote>`;
          }

          return `<p>${escapeHtml(block.text)}</p>`;
        })
        .join("");

      return `
        <section
          id="${escapeAttribute(section.sectionId)}"
          class="reader-section${index === state.currentSectionIndex ? " is-active" : ""}"
          data-section-index="${index}"
        >
          <div class="reader-section-heading">
            <span>Раздел ${escapeHtml(section.title)}</span>
            <h4>${escapeHtml(section.title)}</h4>
          </div>
          ${blocks}
        </section>
      `;
    })
    .join("");
}

function renderLorePanel() {
  const chapter = getCurrentChapter();
  const currentSection = getCurrentSection();
  const selectedCharacter = getCurrentSpeaker();

  elements.storyLorePanel.innerHTML = `
    <div class="panel-heading">
      <h3>Досье главы</h3>
      <span>${escapeHtml(chapter.shortTitle)}</span>
    </div>
    <div class="detail-list">
      ${chapter.dossier.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}
    </div>
    <div class="lore-divider"></div>
    <div class="lore-state">
      <small class="subtitle-label">Активный раздел</small>
      <h3>${escapeHtml(currentSection.title)}</h3>
      <p>${escapeHtml(truncateText(currentSection.preview, 240))}</p>
    </div>
    <div class="lore-divider"></div>
    <div class="detail-list">
      ${state.storyData.storyNotes.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}
    </div>
    ${
      selectedCharacter
        ? `
          <div class="lore-divider"></div>
          <div class="lore-state">
            <small class="subtitle-label">Текущий фокус</small>
            <h3>${escapeHtml(selectedCharacter.name)}</h3>
            <p>${escapeHtml(selectedCharacter.sampleLine)}</p>
          </div>
        `
        : ""
    }
  `;
}

function renderShipSections() {
  elements.shipSectionCards.innerHTML = "";

  state.storyData.shipSections.forEach((section) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ship-section-card";
    button.dataset.sectionId = section.sectionId;
    button.innerHTML = `
      <small>${escapeHtml(section.deck)}</small>
      <h3>${escapeHtml(section.title)}</h3>
      <p>${escapeHtml(section.summary)}</p>
    `;
    button.addEventListener("click", () => {
      state.currentShipSectionId = section.sectionId;
      updateShipSectionDetail();
    });
    elements.shipSectionCards.appendChild(button);
  });

  updateShipSectionDetail();
}

function updateShipSectionDetail() {
  const section = state.storyData.shipSections.find((item) => item.sectionId === state.currentShipSectionId);
  if (!section) return;

  elements.shipSectionDetail.innerHTML = `
    <img src="${escapeAttribute(section.image)}" alt="${escapeAttribute(section.title)}" />
    <small class="subtitle-label">${escapeHtml(section.deck)}</small>
    <h3>${escapeHtml(section.title)}</h3>
    <p>${escapeHtml(section.summary)}</p>
    <div class="detail-list">
      ${section.details.map((detail) => `<div>${escapeHtml(detail)}</div>`).join("")}
    </div>
  `;

  document.querySelectorAll(".ship-section-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.sectionId === state.currentShipSectionId);
  });
}

function renderCrew() {
  elements.crewGrid.innerHTML = "";

  state.characters.forEach((character) => {
    const card = document.createElement("article");
    card.className = "crew-card";
    card.dataset.characterId = character.id;
    card.innerHTML = `
      <img src="${escapeAttribute(character.portrait)}" alt="${escapeAttribute(character.name)}" />
      <div class="crew-card-body">
        <h3>${escapeHtml(character.name)}</h3>
        <div class="crew-meta">
          <span>${escapeHtml(character.role)}</span>
          <span>${escapeHtml(character.altMode)}</span>
        </div>
        <p>${escapeHtml(character.summary)}</p>
        <div class="crew-list">
          ${character.temperament.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}
        </div>
        <p class="crew-quote">${escapeHtml(character.quote)}</p>
      </div>
    `;
    card.addEventListener("click", () => {
      state.currentSpeakerId = character.id;
      updateSpeakerSpotlight();
      renderLorePanel();
      updateActiveHighlights();
      scrollToSection("storySection");
    });
    elements.crewGrid.appendChild(card);
  });

  updateActiveHighlights();
}

function renderRankAndFile() {
  elements.rankCrewGrid.innerHTML = "";

  RANK_AND_FILE.forEach((item) => {
    const card = document.createElement("article");
    card.className = "rank-crew-card";
    card.innerHTML = `
      <small>${escapeHtml(item.subtitle)}</small>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.text)}</p>
    `;
    elements.rankCrewGrid.appendChild(card);
  });
}

function renderMissionLog() {
  elements.missionLog.innerHTML = "";

  state.storyData.missionLog.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mission-log-card";
    button.innerHTML = `
      <small>${escapeHtml(entry.timestampLabel)}</small>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.excerpt)}</p>
      <span class="log-status">${escapeHtml(entry.status)}</span>
    `;
    button.addEventListener("click", () => {
      const chapterIndex = state.storyData.chapters.findIndex((chapter) => chapter.chapterId === entry.chapterLink);
      if (chapterIndex >= 0) {
        selectChapter(chapterIndex, 0);
      }
    });
    elements.missionLog.appendChild(button);
  });
}

function selectChapter(chapterIndex, sectionIndex = 0) {
  state.currentChapterIndex = chapterIndex;
  state.currentSectionIndex = sectionIndex;
  state.currentSpeakerId =
    getCurrentChapter().focusCharacterIds[0] || state.currentSpeakerId || state.characters[0]?.id || null;
  renderCurrentChapter();
  scrollToSection("storySection");
}

function selectSection(sectionIndex, shouldScroll = false) {
  state.currentSectionIndex = sectionIndex;
  elements.sectionProgressLabel.textContent = `Активный раздел: ${getCurrentSection().title}`;
  updateSectionSelection();

  document.querySelectorAll(".reader-section").forEach((section, index) => {
    section.classList.toggle("is-active", index === state.currentSectionIndex);
  });

  renderLorePanel();

  if (shouldScroll) {
    document.getElementById(getCurrentSection().sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function updateSpeakerSpotlight() {
  const character = getCurrentSpeaker();
  if (!character) return;

  elements.speakerSpotlight.innerHTML = `
    <div class="spotlight-card">
      <img src="${escapeAttribute(character.spotlightPortrait || character.portrait)}" alt="${escapeAttribute(character.name)}" />
      <div>
        <small class="subtitle-label">Фокус персонажа</small>
        <h3>${escapeHtml(character.name)}</h3>
        <p>${escapeHtml(character.role)}</p>
      </div>
      <div class="detail-list">
        <div><strong>Альт-режим:</strong> ${escapeHtml(character.altMode)}</div>
        <div><strong>Палуба:</strong> ${escapeHtml(character.deck)}</div>
        <div><strong>Архетип:</strong> ${escapeHtml(character.voiceArchetype)}</div>
      </div>
      <p>${escapeHtml(character.summary)}</p>
      <p class="crew-quote">${escapeHtml(character.quote)}</p>
    </div>
  `;
}

function updateActiveHighlights() {
  document.querySelectorAll(".crew-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.characterId === state.currentSpeakerId);
  });

  document.querySelectorAll(".focus-character-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.characterId === state.currentSpeakerId);
  });
}

function updateChapterSelection() {
  document.querySelectorAll(".chapter-button").forEach((button, index) => {
    button.classList.toggle("is-active", index === state.currentChapterIndex);
  });
}

function updateSectionSelection() {
  document.querySelectorAll(".section-tab").forEach((button, index) => {
    button.classList.toggle("is-active", index === state.currentSectionIndex);
  });
}

function goToPreviousChapter() {
  if (state.currentChapterIndex > 0) {
    selectChapter(state.currentChapterIndex - 1, 0);
  }
}

function goToNextChapter() {
  if (state.currentChapterIndex < state.storyData.chapters.length - 1) {
    selectChapter(state.currentChapterIndex + 1, 0);
  }
}

function getCurrentChapter() {
  return state.storyData.chapters[state.currentChapterIndex];
}

function getCurrentSection() {
  return getCurrentChapter().sections[state.currentSectionIndex];
}

function getCurrentSpeaker() {
  const chapter = getCurrentChapter();
  const fallbackId = chapter.focusCharacterIds[0] || state.characters[0]?.id;
  return state.characterMap.get(state.currentSpeakerId || fallbackId);
}

function detectCharacterIds(text, seededIds = []) {
  const ids = new Set(seededIds);

  state.characters.forEach((character) => {
    const pattern = new RegExp(`\\b${escapeRegExp(character.name)}\\b`, "i");
    if (pattern.test(text)) {
      ids.add(character.id);
    }
  });

  return [...ids];
}

function stripChapterPrefix(value) {
  return String(value).replace(/^Глава\s+[^\.\n]+\.\s*/i, "").trim();
}

function countWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function truncateText(value, limit) {
  const text = String(value || "").trim();
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit).trimEnd()}...`;
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scrollToSection(sectionId) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
