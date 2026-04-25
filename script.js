const state = {
  storyData: null,
  characters: [],
  characterMap: new Map(),
  currentChapterIndex: 0,
  currentSceneIndex: 0,
  currentShipSectionId: null,
  currentSpeakerId: null
};

const elements = {};

const SHIP_FACTS = [
  "Корабль отправили первым, потому что позже коридоры выхода с Кибертрона могли окончательно закрыться.",
  "На борту хранятся архивные ядра, медматрицы, инженерные шаблоны, специалисты и боеспособное автономное ядро.",
  "О них забыли не из-за предательства, а потому что война уничтожила архивы, маршруты и тех, кто знал полный протокол.",
  "Связь не поддерживали годами, потому что любой широкий сигнал мог привести десептиконов либо к кораблю, либо к выжившим автоботам."
];

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
    const [storyData, characters] = await Promise.all([
      fetchJson("data/story.json"),
      fetchJson("data/characters.json")
    ]);

    state.storyData = storyData;
    state.characters = characters;
    state.characterMap = new Map(characters.map((character) => [character.id, character]));
    state.currentShipSectionId = storyData.shipSections[0]?.sectionId || null;

    hydrateHero();
    renderChapterRail();
    renderShipSections();
    renderCrew();
    renderRankAndFile();
    renderMissionLog();
    renderLorePanel();
    selectChapter(0, 0);
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `
      <main style="padding: 2rem; color: #edf5ff; font-family: Segoe UI, sans-serif;">
        <h1>Не удалось загрузить данные сайта</h1>
        <p>Проверьте, что проект открыт через локальный сервер, а JSON-файлы лежат на месте.</p>
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
    "sceneNarrator",
    "sceneBackground",
    "sceneMood",
    "sceneTabs",
    "prevSceneBtn",
    "nextSceneBtn",
    "dialogueProgressLabel",
    "dialogueList",
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
  elements.prevSceneBtn.addEventListener("click", goToPreviousScene);
  elements.nextSceneBtn.addEventListener("click", goToNextScene);
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  }
  return response.json();
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
      <strong>${escapeHtml(chapter.title)}</strong>
      <p>${escapeHtml(chapter.introText.slice(0, 110))}...</p>
    `;
    button.addEventListener("click", () => selectChapter(index, 0));
    elements.chapterRail.appendChild(button);
  });
}

function renderSceneTabs() {
  const chapter = getCurrentChapter();
  elements.sceneTabs.innerHTML = "";

  chapter.scenes.forEach((scene, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-tab";
    button.innerHTML = `
      <small>Сцена ${index + 1}</small>
      <strong>${escapeHtml(scene.title)}</strong>
    `;
    button.addEventListener("click", () => selectScene(index));
    elements.sceneTabs.appendChild(button);
  });
}

function selectChapter(chapterIndex, sceneIndex = 0) {
  state.currentChapterIndex = chapterIndex;
  state.currentSceneIndex = sceneIndex;
  state.currentSpeakerId = getCurrentScene().dialogue[0]?.speakerId || null;
  renderSceneTabs();
  renderCurrentScene();
  updateChapterSelection();
  scrollToSection("storySection");
}

function selectScene(sceneIndex) {
  state.currentSceneIndex = sceneIndex;
  state.currentSpeakerId = getCurrentScene().dialogue[0]?.speakerId || state.currentSpeakerId;
  renderCurrentScene();
}

function renderCurrentScene() {
  const chapter = getCurrentChapter();
  const scene = getCurrentScene();

  elements.chapterCounter.textContent = `${state.currentChapterIndex + 1} / ${state.storyData.chapters.length}`;
  elements.chapterTitle.textContent = chapter.title;
  elements.sceneTitle.textContent = scene.title;
  elements.chapterIntro.textContent = chapter.introText;
  elements.sceneNarrator.textContent = scene.narratorText;
  elements.sceneMood.textContent = scene.musicMood;
  elements.sceneBackground.src = scene.backgroundImage;
  elements.sceneBackground.alt = scene.title;
  elements.prevSceneBtn.disabled = state.currentChapterIndex === 0 && state.currentSceneIndex === 0;
  elements.nextSceneBtn.disabled =
    state.currentChapterIndex === state.storyData.chapters.length - 1 &&
    state.currentSceneIndex === chapter.scenes.length - 1;

  renderDialogueList();
  updateSceneSelection();
  updateSpeakerSpotlight();
}

function renderDialogueList() {
  const scene = getCurrentScene();
  elements.dialogueList.innerHTML = "";
  elements.dialogueProgressLabel.textContent = `Реплик в сцене: ${scene.dialogue.length}`;

  scene.dialogue.forEach((line) => {
    const character = state.characterMap.get(line.speakerId);
    const card = document.createElement("article");
    card.className = "dialogue-card";
    card.dataset.characterId = line.speakerId;
    card.innerHTML = `
      <div class="dialogue-avatar">
        <img src="${escapeAttribute(character?.portrait || "")}" alt="${escapeAttribute(character?.name || "Speaker")}" />
      </div>
      <div class="dialogue-body">
        <strong>${escapeHtml(character?.name || line.speakerId)}</strong>
        <div class="dialogue-meta">
          <span>${escapeHtml(character?.role || "Реплика")}</span>
          <span>${escapeHtml(line.emotion)}</span>
        </div>
        <p class="dialogue-text">${escapeHtml(line.text)}</p>
      </div>
    `;
    card.addEventListener("click", () => {
      state.currentSpeakerId = line.speakerId;
      updateSpeakerSpotlight();
      updateActiveHighlights();
    });
    elements.dialogueList.appendChild(card);
  });

  updateActiveHighlights();
}

function renderLorePanel() {
  elements.storyLorePanel.innerHTML = `
    <div class="rail-heading">
      <h3>Что хранит корабль</h3>
      <span>Ключевые факты</span>
    </div>
    <div class="detail-list">
      ${SHIP_FACTS.map((fact) => `<div>${escapeHtml(fact)}</div>`).join("")}
    </div>
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

function updateSpeakerSpotlight() {
  const fallbackSpeaker = getCurrentScene().dialogue[0]?.speakerId || state.characters[0]?.id;
  const speakerId = state.currentSpeakerId || fallbackSpeaker;
  const character = state.characterMap.get(speakerId);
  if (!character) return;

  elements.speakerSpotlight.innerHTML = `
    <div class="spotlight-card">
      <img src="${escapeAttribute(character.portrait)}" alt="${escapeAttribute(character.name)}" />
      <div>
        <small class="subtitle-label">Фокус сцены</small>
        <h3>${escapeHtml(character.name)}</h3>
        <p>${escapeHtml(character.role)}</p>
      </div>
      <div class="detail-list">
        <div><strong>Альт-режим:</strong> ${escapeHtml(character.altMode)}</div>
        <div><strong>Палуба:</strong> ${escapeHtml(character.deck)}</div>
        <div><strong>Характер:</strong> ${escapeHtml(character.voiceArchetype)}</div>
      </div>
      <p class="crew-quote">${escapeHtml(character.quote)}</p>
    </div>
  `;
}

function updateActiveHighlights() {
  document.querySelectorAll(".dialogue-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.characterId === state.currentSpeakerId);
  });

  document.querySelectorAll(".crew-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.characterId === state.currentSpeakerId);
  });
}

function updateChapterSelection() {
  document.querySelectorAll(".chapter-button").forEach((button, index) => {
    button.classList.toggle("is-active", index === state.currentChapterIndex);
  });
}

function updateSceneSelection() {
  document.querySelectorAll(".scene-tab").forEach((button, index) => {
    button.classList.toggle("is-active", index === state.currentSceneIndex);
  });
}

function goToPreviousScene() {
  if (state.currentSceneIndex > 0) {
    selectScene(state.currentSceneIndex - 1);
    return;
  }

  if (state.currentChapterIndex > 0) {
    const previousChapter = state.currentChapterIndex - 1;
    const previousScene = state.storyData.chapters[previousChapter].scenes.length - 1;
    selectChapter(previousChapter, previousScene);
  }
}

function goToNextScene() {
  const chapter = getCurrentChapter();

  if (state.currentSceneIndex < chapter.scenes.length - 1) {
    selectScene(state.currentSceneIndex + 1);
    return;
  }

  if (state.currentChapterIndex < state.storyData.chapters.length - 1) {
    selectChapter(state.currentChapterIndex + 1, 0);
  }
}

function getCurrentChapter() {
  return state.storyData.chapters[state.currentChapterIndex];
}

function getCurrentScene() {
  return getCurrentChapter().scenes[state.currentSceneIndex];
}

function scrollToSection(sectionId) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
