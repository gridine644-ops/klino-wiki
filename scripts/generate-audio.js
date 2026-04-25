import { readFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function main() {
  loadEnvFile(path.join(projectRoot, ".env"));

  const provider = (process.env.TTS_PROVIDER || "openai").toLowerCase();
  const storyPath = path.join(projectRoot, "data", "story.json");
  const voiceProfilesPath = path.join(projectRoot, "data", "voiceProfiles.json");

  const story = JSON.parse(await readFile(storyPath, "utf8"));
  const voiceData = JSON.parse(await readFile(voiceProfilesPath, "utf8"));
  const voiceProfiles = voiceData.profiles || {};

  const dialogueJobs = collectDialogueJobs(story);
  const summary = {
    total: dialogueJobs.length,
    generated: 0,
    skipped: 0,
    failed: 0
  };

  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY не задан. Добавьте ключ в .env или выберите другой TTS_PROVIDER.");
  }

  if (provider === "elevenlabs" && !process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY не задан. Добавьте ключ в .env или выберите другой TTS_PROVIDER.");
  }

  console.log(`TTS provider: ${provider}`);
  console.log(`Реплик в очереди: ${summary.total}`);

  for (let index = 0; index < dialogueJobs.length; index += 1) {
    const job = dialogueJobs[index];
    const profile = voiceProfiles[job.speakerId];
    const prefix = `[${index + 1}/${dialogueJobs.length}]`;

    if (!profile) {
      summary.failed += 1;
      console.error(`${prefix} Нет voice profile для ${job.speakerId}.`);
      continue;
    }

    const outputPath = path.join(projectRoot, job.audioFile);

    if (await fileExists(outputPath)) {
      summary.skipped += 1;
      console.log(`${prefix} Skip ${job.audioFile}`);
      continue;
    }

    await mkdir(path.dirname(outputPath), { recursive: true });

    try {
      const audioBuffer =
        provider === "openai"
          ? await generateWithOpenAI(job, profile)
          : await generateWithElevenLabs(job, profile);

      await writeFile(outputPath, audioBuffer);
      summary.generated += 1;
      console.log(`${prefix} Saved ${job.audioFile}`);
    } catch (error) {
      summary.failed += 1;
      console.error(`${prefix} Ошибка для ${job.audioFile}: ${error.message}`);
    }
  }

  console.log("");
  console.log("Генерация завершена.");
  console.log(`Сгенерировано: ${summary.generated}`);
  console.log(`Пропущено: ${summary.skipped}`);
  console.log(`Ошибок: ${summary.failed}`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

function collectDialogueJobs(story) {
  return story.chapters.flatMap((chapter) =>
    chapter.scenes.flatMap((scene) =>
      scene.dialogue
        .filter((line) => line.audioFile)
        .map((line) => ({
          chapterId: chapter.chapterId,
          sceneId: scene.sceneId,
          title: chapter.title,
          sceneTitle: scene.title,
          speakerId: line.speakerId,
          emotion: line.emotion,
          text: line.text,
          audioFile: line.audioFile
        }))
    )
  );
}

async function generateWithOpenAI(job, profile) {
  const openai = profile.openai || {};
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: openai.model || "gpt-4o-mini-tts",
      voice: openai.voice || "alloy",
      input: job.text,
      instructions: openai.instructions,
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    const details = await safeErrorText(response);
    throw new Error(`OpenAI API ${response.status}: ${details}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateWithElevenLabs(job, profile) {
  const elevenlabs = profile.elevenlabs || {};
  if (!elevenlabs.voiceId) {
    throw new Error(
      `Для ElevenLabs у профиля ${job.speakerId} не задан voiceId в data/voiceProfiles.json.`
    );
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    elevenlabs.voiceId
  )}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": process.env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text: job.text,
      model_id: elevenlabs.modelId || "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
      voice_settings: elevenlabs.voiceSettings || {}
    })
  });

  if (!response.ok) {
    const details = await safeErrorText(response);
    throw new Error(`ElevenLabs API ${response.status}: ${details}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function loadEnvFile(envPath) {
  try {
    const raw = readFileSync(envPath, "utf8");
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .forEach((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      });
  } catch {
    // .env optional
  }
}

async function safeErrorText(response) {
  try {
    return await response.text();
  } catch {
    return "Не удалось прочитать тело ошибки.";
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
