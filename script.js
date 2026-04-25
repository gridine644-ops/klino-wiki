const state = {
  storyData: null,
  characters: [],
  characterMap: new Map(),
  voiceProfiles: {},
  currentChapterIndex: 0,
  currentSceneIndex: 0,
  currentShipSectionId: null,
  currentLineKey: null,
  currentSpeakerId: null,
  isPlaying: false,
  audioEnabled: localStorage.getItem("aegis-audio-enabled") !== "false",
  selectedBrowserVoice: localStorage.getItem("aegis-browser-voice") || "",
  selectedVoiceCharacter: localStorage.getItem("aegis-voice-character") || "ironcrest",
  audioAvailability: new Map(),
  currentAudio: null,
  currentUtterance: null,
  browserVoices: []
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindStaticEvents();

  try {
    const [storyData, characters, voiceData] = await Promise.all([
      fetchJson("data/story.json"),
      fetchJson("data/characters.json"),
      fetchJson("data/voiceProfiles.json")
    ]);

    state.storyData = storyData;
    state.characters = characters;
    state.voiceProfiles = voiceData.profiles;
    state.characterMap = new Map(characters.map((character) => [character.id, character]));
    state.currentShipSectionId = storyData.shipSections[0]?.sectionId || null;

    hydrateHero();
    renderChapterRail();
    renderShipSections();
    renderCrew();
    renderVoiceProfiles();
    renderMissionLog();
    renderVoiceCharacterOptions();
    updateVoiceToggle();
    populateBrowserVoices();
    setSelectedVoiceCharacter(state.selectedVoiceCharacter);
    selectChapter(0, 0);
    updatePlaybackStatus("Озвучка ожидает");
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `
      <main style="padding: 2rem; color: #edf5ff; font-family: Segoe UI, sans-serif;">
        <h1>Не удалось загрузить данные сайта</h1>
        <p>Проверьте, что проект открыт через локальный сервер, а JSON-файлы находятся на месте.</p>
        <pre>${escapeHtml(String(error.message || error))}</pre>
      </main>
    `;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener?.("voiceschanged", populateBrowserVoices);
    window.speechSynthesis.onvoiceschanged = populateBrowserVoices;
  }

  window.addEventListener("beforeunload", () => stopCurrentPlayback({ keepSelection: true }));
}

function cacheElements() {
  const ids = [
    "voiceToggleBtn",
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
    "subtitleSpeaker",
    "subtitleText",
    "subtitleSource",
    "dialogueProgressLabel",
    "dialogueList",
    "speakerSpotlight",
    "playbackStatus",
    "voiceCharacterSelect",
    "browserVoiceSelect",
    "voiceTestBtn",
    "shipSectionCards",
    "shipSectionDetail",
    "crewGrid",
    "voiceProfileGrid",
    "voiceSampleText",
    "playCustomSampleBtn",
    "stopPlaybackBtn",
    "missionLog"
  ];

  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindStaticEvents() {
  elements.voiceToggleBtn.addEventListener("click", toggleAudio);
  elements.heroStartBtn.addEventListener("click", () => {
    scrollToSection("storySection");
    selectChapter(0, 0);
  });
  elements.heroCrewBtn.addEventListener("click", () => scrollToSection("crewSection"));
  elements.heroJournalBtn.addEventListener("click", () => scrollToSection("journalSection"));
  elements.prevSceneBtn.addEventListener("click", goToPreviousScene);
  elements.nextSceneBtn.addEventListener("click", goToNextScene);
  elements.voiceCharacterSelect.addEventListener("change", (event) => {
    setSelectedVoiceCharacter(event.target.value);
  });
  elements.browserVoiceSelect.addEventListener("change", (event) => {
    state.selectedBrowserVoice = event.target.value;
    localStorage.setItem("aegis-browser-voice", state.selectedBrowserVoice);
  });
  elements.voiceTestBtn.addEventListener("click", () => {
    const characterId = elements.voiceCharacterSelect.value;
    const character = state.characterMap.get(characterId);
    if (!character) return;
    playSpeechText(characterId, character.sampleLine, {
      sourceLabel: "SpeechSynthesis test"
    });
  });
  elements.playCustomSampleBtn.addEventListener("click", () => {
    const characterId = elements.voiceCharacterSelect.value;
    const sample = elements.voiceSampleText.value.trim();
    const character = state.characterMap.get(characterId);
    if (!character || !sample) return;
    playSpeechText(characterId, sample, {
      sourceLabel: "Voice lab sample"
    });
  });
  elements.stopPlaybackBtn.addEventListener("click", () => stopCurrentPlayback({ keepSelection: true }));
  elements.voiceSampleText.addEventListener("input", () => {
    elements.voiceSampleText.dataset.autofill = "false";
  });
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
    button.dataset.chapterIndex = String(index);
    button.innerHTML = `
      <small>Глава ${String(index + 1).padStart(2, "0")}</small>
      <strong>${escapeHtml(chapter.title)}</strong>
      <p>${escapeHtml(chapter.introText.slice(0, 92))}...</p>
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
    button.dataset.sceneIndex = String(index);
    button.innerHTML = `
      <small>Сцена ${index + 1}</small>
      <strong>${escapeHtml(scene.title)}</strong>
    `;
    button.addEventListener("click", () => selectScene(index));
    elements.sceneTabs.appendChild(button);
  });
}

function selectChapter(chapterIndex, sceneIndex = 0) {
  if (!state.storyData) return;
  stopCurrentPlayback({ keepSelection: false });
  state.currentChapterIndex = chapterIndex;
  state.currentSceneIndex = sceneIndex;
  state.currentLineKey = null;
  state.currentSpeakerId = getCurrentScene().dialogue[0]?.speakerId || null;
  renderSceneTabs();
  renderCurrentScene();
  updateChapterSelection();
  scrollToSection("storySection");
}

function selectScene(sceneIndex) {
  stopCurrentPlayback({ keepSelection: false });
  state.currentSceneIndex = sceneIndex;
  state.currentLineKey = null;
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
  elements.prevSceneBtn.disabled = state.currentSceneIndex === 0;
  elements.nextSceneBtn.disabled = state.currentSceneIndex === chapter.scenes.length - 1;

  renderDialogueList();
  updateChapterSelection();
  updateSceneSelection();
  updateSpeakerSpotlight();
  updateDialogueProgress();

  if (!state.currentLineKey) {
    setSubtitleFromIdleScene(scene);
  }
}

function renderDialogueList() {
  const scene = getCurrentScene();
  elements.dialogueList.innerHTML = "";

  scene.dialogue.forEach((line, index) => {
    const character = state.characterMap.get(line.speakerId);
    const lineKey = buildLineKey(index);
    const card = document.createElement("article");
    card.className = "dialogue-card";
    card.dataset.lineKey = lineKey;
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
      <div class="dialogue-play">
        <button class="secondary-button compact-button" type="button">
          ${state.currentLineKey === lineKey && state.isPlaying ? "Pause" : "Play"}
        </button>
      </div>
    `;

    card.querySelector("button").addEventListener("click", () => handleDialoguePlayback(line, index));
    elements.dialogueList.appendChild(card);
  });

  updateActiveHighlights();
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
      ${section.details
        .map((detail) => `<div>${escapeHtml(detail)}</div>`)
        .join("")}
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
    elements.crewGrid.appendChild(card);
  });

  updateActiveHighlights();
}

function renderVoiceProfiles() {
  elements.voiceProfileGrid.innerHTML = "";

  state.characters.forEach((character) => {
    const profile = state.voiceProfiles[character.id];
    const card = document.createElement("article");
    card.className = "voice-card";
    card.dataset.characterId = character.id;
    card.innerHTML = `
      <div class="voice-card-body">
        <h3>${escapeHtml(character.name)}</h3>
        <div class="voice-meta">
          <span>${escapeHtml(profile.displayName)}</span>
          <span>OpenAI: ${escapeHtml(profile.openai.voice)}</span>
        </div>
        <p>${escapeHtml(profile.archetype)}</p>
        <div class="voice-list">
          <div>Browser fallback: ${escapeHtml(profile.browser.lang)} / rate ${profile.browser.rate}</div>
          <div>ElevenLabs voiceId: ${profile.elevenlabs.voiceId ? escapeHtml(profile.elevenlabs.voiceId) : "не задан"}</div>
        </div>
        <button class="secondary-button compact-button" type="button">Тест архетипа</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", () => {
      setSelectedVoiceCharacter(character.id);
      playSpeechText(character.id, character.sampleLine, { sourceLabel: "Voice profile test" });
    });
    elements.voiceProfileGrid.appendChild(card);
  });

  updateActiveHighlights();
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

function renderVoiceCharacterOptions() {
  elements.voiceCharacterSelect.innerHTML = "";

  state.characters.forEach((character) => {
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent = `${character.name} — ${character.role}`;
    elements.voiceCharacterSelect.appendChild(option);
  });
}

function setSelectedVoiceCharacter(characterId) {
  if (!state.characterMap.has(characterId)) return;
  state.selectedVoiceCharacter = characterId;
  localStorage.setItem("aegis-voice-character", characterId);
  elements.voiceCharacterSelect.value = characterId;

  const character = state.characterMap.get(characterId);
  if (!elements.voiceSampleText.value.trim() || elements.voiceSampleText.dataset.autofill === "true") {
    elements.voiceSampleText.value = character.sampleLine;
    elements.voiceSampleText.dataset.autofill = "true";
  }
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

function updateActiveHighlights() {
  document.querySelectorAll(".dialogue-card").forEach((card) => {
    const isSelected = card.dataset.lineKey === state.currentLineKey;
    card.classList.toggle("is-active", isSelected);

    const button = card.querySelector("button");
    if (button) {
      button.textContent = isSelected && state.isPlaying ? "Pause" : "Play";
    }
  });

  document.querySelectorAll(".crew-card, .voice-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.characterId === state.currentSpeakerId);
  });
}

function updateSpeakerSpotlight() {
  const fallbackSpeaker = getCurrentScene().dialogue[0]?.speakerId || state.selectedVoiceCharacter;
  const speakerId = state.currentSpeakerId || fallbackSpeaker;
  const character = state.characterMap.get(speakerId);
  if (!character) return;

  elements.speakerSpotlight.innerHTML = `
    <div class="spotlight-card">
      <img src="${escapeAttribute(character.portrait)}" alt="${escapeAttribute(character.name)}" />
      <div>
        <small class="subtitle-label">Активный фокус</small>
        <h3>${escapeHtml(character.name)}</h3>
        <p>${escapeHtml(character.role)}</p>
      </div>
      <div class="detail-list">
        <div><strong>Альт-режим:</strong> ${escapeHtml(character.altMode)}</div>
        <div><strong>Палуба:</strong> ${escapeHtml(character.deck)}</div>
        <div><strong>Голос:</strong> ${escapeHtml(character.voiceArchetype)}</div>
      </div>
      <p class="crew-quote">${escapeHtml(character.quote)}</p>
    </div>
  `;
}

function updateDialogueProgress() {
  const scene = getCurrentScene();
  if (!state.currentLineKey) {
    elements.dialogueProgressLabel.textContent = `Активная реплика: нет (${scene.dialogue.length} в сцене)`;
    return;
  }

  const activeIndex = scene.dialogue.findIndex((_, index) => buildLineKey(index) === state.currentLineKey);
  if (activeIndex === -1) {
    elements.dialogueProgressLabel.textContent = `Активная реплика: нет (${scene.dialogue.length} в сцене)`;
    return;
  }

  elements.dialogueProgressLabel.textContent = `Активная реплика: ${activeIndex + 1} / ${scene.dialogue.length}`;
}

async function handleDialoguePlayback(line, index) {
  const lineKey = buildLineKey(index);

  if (state.currentLineKey === lineKey && state.isPlaying) {
    stopCurrentPlayback({ keepSelection: true });
    updatePlaybackStatus("Воспроизведение остановлено");
    return;
  }

  stopCurrentPlayback({ keepSelection: false });
  state.currentLineKey = lineKey;
  state.currentSpeakerId = line.speakerId;
  state.isPlaying = false;
  updateSpeakerSpotlight();
  updateActiveHighlights();
  updateDialogueProgress();

  const character = state.characterMap.get(line.speakerId);
  updateSubtitles(character?.name || "Неизвестный источник", line.text, "подготовка");

  if (!state.audioEnabled) {
    updatePlaybackStatus("Озвучка выключена");
    updateActiveHighlights();
    return;
  }

  const hasAudio = await audioFileExists(line.audioFile);
  if (state.currentLineKey !== lineKey) {
    return;
  }

  if (hasAudio) {
    playLocalAudio(line, lineKey);
  } else {
    playSpeechText(line.speakerId, line.text, {
      sourceLabel: "SpeechSynthesis fallback",
      lineKey
    });
  }
}

async function audioFileExists(path) {
  if (!path) return false;
  if (state.audioAvailability.has(path)) {
    return state.audioAvailability.get(path);
  }

  try {
    const response = await fetch(path, { method: "HEAD" });
    const exists = response.ok;
    state.audioAvailability.set(path, exists);
    return exists;
  } catch (error) {
    state.audioAvailability.set(path, false);
    return false;
  }
}

function playLocalAudio(line, lineKey) {
  const character = state.characterMap.get(line.speakerId);
  const audio = new Audio(line.audioFile);

  audio.addEventListener("play", () => {
    state.currentAudio = audio;
    state.isPlaying = true;
    updatePlaybackStatus("Источник: локальный audio file");
    updateSubtitles(character?.name || "Audio", line.text, "local file");
    updateActiveHighlights();
  });

  audio.addEventListener("ended", () => {
    state.currentAudio = null;
    state.isPlaying = false;
    updatePlaybackStatus("Реплика завершена");
    updateActiveHighlights();
  });

  audio.addEventListener("error", () => {
    state.currentAudio = null;
    state.isPlaying = false;
    playSpeechText(line.speakerId, line.text, {
      sourceLabel: "SpeechSynthesis fallback",
      lineKey
    });
  });

  audio.play().catch(() => {
    playSpeechText(line.speakerId, line.text, {
      sourceLabel: "SpeechSynthesis fallback",
      lineKey
    });
  });
}

function playSpeechText(characterId, text, options = {}) {
  if (!state.audioEnabled) {
    updatePlaybackStatus("Озвучка выключена");
    return;
  }

  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    updatePlaybackStatus("SpeechSynthesis недоступен в этом браузере");
    updateSubtitles("System", text, "нет синтеза");
    return;
  }

  stopCurrentPlayback({ keepSelection: true, cancelSpeech: true });

  const character = state.characterMap.get(characterId);
  const profile = state.voiceProfiles[characterId];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = profile?.browser?.lang || "ru-RU";
  utterance.rate = profile?.browser?.rate || 1;
  utterance.pitch = profile?.browser?.pitch || 1;
  const selectedVoice = pickBrowserVoice();
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang || utterance.lang;
  }

  const targetLineKey = options.lineKey || state.currentLineKey || `sample:${characterId}`;
  state.currentLineKey = targetLineKey;
  state.currentSpeakerId = characterId;
  state.currentUtterance = utterance;

  utterance.onstart = () => {
    state.isPlaying = true;
    updatePlaybackStatus(`Источник: ${options.sourceLabel || "SpeechSynthesis fallback"}`);
    updateSubtitles(character?.name || "Voice", text, options.sourceLabel || "SpeechSynthesis fallback");
    updateSpeakerSpotlight();
    updateActiveHighlights();
    updateDialogueProgress();
  };

  utterance.onend = () => {
    state.currentUtterance = null;
    state.isPlaying = false;
    updatePlaybackStatus("Реплика завершена");
    updateActiveHighlights();
  };

  utterance.onerror = () => {
    state.currentUtterance = null;
    state.isPlaying = false;
    updatePlaybackStatus("Ошибка SpeechSynthesis");
    updateActiveHighlights();
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function pickBrowserVoice() {
  if (!state.browserVoices.length) return null;

  if (state.selectedBrowserVoice) {
    const explicit = state.browserVoices.find((voice) => voice.name === state.selectedBrowserVoice);
    if (explicit) return explicit;
  }

  return (
    state.browserVoices.find((voice) => voice.lang.toLowerCase().startsWith("ru")) ||
    state.browserVoices[0] ||
    null
  );
}

function populateBrowserVoices() {
  if (!("speechSynthesis" in window)) {
    return;
  }

  const voices = window.speechSynthesis
    .getVoices()
    .slice()
    .sort((a, b) => {
      const aRu = a.lang.toLowerCase().startsWith("ru") ? -1 : 1;
      const bRu = b.lang.toLowerCase().startsWith("ru") ? -1 : 1;
      if (aRu !== bRu) return aRu - bRu;
      return a.name.localeCompare(b.name);
    });

  state.browserVoices = voices;
  const previousValue = state.selectedBrowserVoice;
  elements.browserVoiceSelect.innerHTML = `<option value="">Автовыбор</option>`;

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.browserVoiceSelect.appendChild(option);
  });

  if (voices.some((voice) => voice.name === previousValue)) {
    elements.browserVoiceSelect.value = previousValue;
  }
}

function goToPreviousScene() {
  if (state.currentSceneIndex > 0) {
    selectScene(state.currentSceneIndex - 1);
  } else if (state.currentChapterIndex > 0) {
    const previousChapter = state.currentChapterIndex - 1;
    const previousScene = state.storyData.chapters[previousChapter].scenes.length - 1;
    selectChapter(previousChapter, previousScene);
  }
}

function goToNextScene() {
  const chapter = getCurrentChapter();
  if (state.currentSceneIndex < chapter.scenes.length - 1) {
    selectScene(state.currentSceneIndex + 1);
  } else if (state.currentChapterIndex < state.storyData.chapters.length - 1) {
    selectChapter(state.currentChapterIndex + 1, 0);
  }
}

function toggleAudio() {
  state.audioEnabled = !state.audioEnabled;
  localStorage.setItem("aegis-audio-enabled", String(state.audioEnabled));
  if (!state.audioEnabled) {
    stopCurrentPlayback({ keepSelection: true });
    updatePlaybackStatus("Озвучка отключена");
  } else {
    updatePlaybackStatus("Озвучка включена");
  }
  updateVoiceToggle();
}

function updateVoiceToggle() {
  elements.voiceToggleBtn.textContent = `Озвучка: ${state.audioEnabled ? "включена" : "выключена"}`;
  elements.voiceToggleBtn.setAttribute("aria-pressed", String(state.audioEnabled));
}

function stopCurrentPlayback(options = {}) {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    state.currentAudio = null;
  }

  if (("speechSynthesis" in window) && (state.currentUtterance || options.cancelSpeech)) {
    window.speechSynthesis.cancel();
    state.currentUtterance = null;
  }

  state.isPlaying = false;

  if (!options.keepSelection) {
    state.currentLineKey = null;
  }

  updateActiveHighlights();
  updateDialogueProgress();
}

function updatePlaybackStatus(message) {
  elements.playbackStatus.textContent = message;
}

function updateSubtitles(speaker, text, source) {
  elements.subtitleSpeaker.textContent = speaker;
  elements.subtitleText.textContent = text;
  elements.subtitleSource.textContent = `Источник: ${source}`;
}

function setSubtitleFromIdleScene(scene) {
  updateSubtitles("Нарративный канал", scene.narratorText, "scene briefing");
}

function buildLineKey(index) {
  const chapter = getCurrentChapter();
  const scene = getCurrentScene();
  return `${chapter.chapterId}:${scene.sceneId}:${index}`;
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
