import { bot, BotFlavor } from "./bot.ts";
import { CivitAI, ModelVersion } from "./civitai.ts";

const PRIVATE_START_TEXT = `
Hey, I'm Jinx!

I'm a work in progress, but currently I am capable of:
- Getting information about a model from CivitAI. Send a link and I'll send a summary of the model.
- Getting the metadata for a given image and returning it. Any resources in the metadata that resolve to models on CivitAI will be summarized as well. Because of the way Telegram works, this will only work for images that are sent uncompressed.

In the future I will also be able to do image generation, but that's not ready yet.
`;

const PUBLIC_START_TEXT = `
Hey, I'm Jinx! Visit me in private to learn more about what I can do.
`;

const HELP_TEXT = `
Hey, I'd be happy to help. I'm Jinx, the group assistant for the Telegram collection of Unstable Diffusion groups. The following is a list of commands I can respond to:

- \`/help        \`: Show this message.
- \`/start       \`: Show the welcome message.
- \`/model <link>\`: Get information about a model from CivitAI. Send a link and I'll send a summary of the model.
- \`/meta        \`: Get the metadata for a given image and return it. Any resources in the metadata that resolve to models on CivitAI will be summarized as well. Because of the way Telegram works, this will only work for images that are sent uncompressed.
`;

const civitai = new CivitAI();

// Use stars `⭐` to represent the rating of a model.
const ratingToStars = (rating: number) => {
  const stars = Math.round(rating);
  return "⭐".repeat(stars);
};

bot.command("start", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.replyWithMarkdownV1(PRIVATE_START_TEXT);
  } else {
    await ctx.replyWithMarkdownV1(PUBLIC_START_TEXT);
  }
});

bot.command("help", async (ctx) => {
  await ctx.replyWithMarkdownV1(HELP_TEXT);
});

bot.command("model", async (ctx) => {
  const idOrHash = ctx.message?.text?.split(" ")[1];
  if (!idOrHash) {
    await ctx.reply("Please provide an id, hash, or link to a model.");
    return;
  }

  let id: string | undefined;
  let hash: string | undefined;
  let versionId: string | undefined;

  if (idOrHash.startsWith("http")) {
    const match = idOrHash.match(
      /\/models\/([0-9]+)(\/?\?modelVersionId=([0-9]+))?/,
    );
    if (match) {
      id = match[1];
      versionId = match[2];
    }
  } else if (idOrHash.match(/^[0-9]+$/)) {
    id = idOrHash;
  } else if (idOrHash.match(/^[a-zA-Z0-9]+$/)) {
    hash = idOrHash;
  }

  await sendModelInfo({ id, hash, versionId, ctx });
});

bot.hears(
  /civitai\.com\/models\/([0-9]+)(?:\/?\?modelVersionId=([0-9]+))?/,
  async (ctx) => {
    await sendModelInfo({ id: ctx.match[1], versionId: ctx.match[2], ctx });
  },
);

const sendModelInfo = async (
  opts: { id?: string; hash?: string; versionId?: string; ctx: BotFlavor },
) => {
  // `idOrHash` could be a link, an id, or a hash. We need to figure out which it is.
  // If it's a link we need to extract the id or hash from it.
  const { id, hash, versionId, ctx } = opts;

  const modelInfo: string[] = [];

  if (id) {
    const model = await civitai.getModelById(parseInt(id)).catch(() => null);
    if (model) {
      const latestVersion = model.modelVersions[model.modelVersions.length - 1];
      const primaryFile = latestVersion.files.find((file) => file.primary);
      modelInfo.push(
        `*${model.name}* [(link)](https://civitai.com/models/${model.id})`,
      );
      modelInfo.push(ratingToStars(model.stats.rating));
      modelInfo.push("");
      modelInfo.push(`*Type*: \`${model.type}\``);
      modelInfo.push(`*Tags*: \`${model.tags.join(", ")}\``);
      modelInfo.push(`*Downloads*: \`${model.stats.downloadCount}\``);
      modelInfo.push(`*Uploaded*: \`${latestVersion.createdAt}\``);
      modelInfo.push(
        `*Base Model*: \`${latestVersion.baseModel ?? "Unknown"}\``,
      );
      if (primaryFile && primaryFile.hashes.AutoV1) {
        modelInfo.push(`*AutoV1 Hash*: \`${primaryFile.hashes.AutoV1}\``);
      }
      modelInfo.push("*Versions*:");
      for (const version of model.modelVersions) {
        modelInfo.push(
          `  - [${version.name}](https://civitai.com/models/${model.id}?modelVersionId=${version.id})`,
        );
      }
    }
  } else if (versionId || hash) {
    let modelVersion: ModelVersion | undefined;
    if (versionId) {
      modelVersion = await civitai.getModelByVersionId(parseInt(versionId));
    } else if (hash) {
      modelVersion = await civitai.getModelByVersionHash(hash);
    }

    if (modelVersion) {
      console.log(modelVersion);
      const model = modelVersion.model;
      const primaryFile = modelVersion.files.find((file) => file.primary);
      modelInfo.push(
        `*${model.name} ${modelVersion.name}* [(link)](https://civitai.com/models/${modelVersion.modelId}?modelVersionId=${modelVersion.id})`,
      );
      modelInfo.push(ratingToStars(modelVersion.stats.rating));
      modelInfo.push("");
      modelInfo.push(`*Type*: \`${modelVersion.baseModelType}\``);
      modelInfo.push(`*Downloads*: \`${modelVersion.stats.downloadCount}\``);
      modelInfo.push(`*Uploaded*: \`${modelVersion.createdAt}\``);
      modelInfo.push(
        `*Base Model*: \`${modelVersion.baseModel ?? "Unknown"}\``,
      );
      if (primaryFile && primaryFile.hashes.AutoV1) {
        modelInfo.push(`*AutoV1 Hash*: \`${primaryFile.hashes.AutoV1}\``);
      }
    }
  }

  if (modelInfo.length) {
    const text = modelInfo.join("\n");
    await ctx.replyWithMarkdownV1(text, {
      disable_web_page_preview: true,
    });
  } else {
    await ctx.reply("I couldn't find that model.");
  }
};
