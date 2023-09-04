import { SDHelper } from "stable-diffusion-webui";
import { bot, BotFlavor } from "./bot.ts";
import { CivitAI, ModelVersion } from "./civitai.ts";
import {
  StableDiffusionProcessingTxt2Img,
  TextToImageResponse,
} from "https://raw.githubusercontent.com/watzon/stable-diffusion-client/main/src/SDModels.ts";
import { InputFile } from "grammy";
import { Queue } from "./queue.ts";

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
    await ctx.reply(PRIVATE_START_TEXT);
  } else {
    await ctx.reply(PUBLIC_START_TEXT);
  }
});

bot.command("help", async (ctx) => {
  await ctx.reply(HELP_TEXT);
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
    await ctx.reply(text, {
      disable_web_page_preview: true,
    });
  } else {
    await ctx.reply("I couldn't find that model.");
  }
};

const genQueue = new Queue();
const flagRegex =
  / (?:--|-)([a-zA-Z]+)(?:=| ([a-zA-Z0-9]+)| "([^"]+)"| '([^']+)'| ”([^\”]+)”| «([^»]+)»| ‹([^›]+)›)?/g;
const defaultNegative = "BadDream easynegative";
const UDGroupIds = [
  // -1001894376699,
  -1001701350553,
  -1001806234763,
];

bot.command("dream", async (ctx) => {
  if (!UDGroupIds.includes(ctx.chat.id) && !(ctx.from?.id === 370663289)) {
    return await ctx.reply(
      "Sorry, but the `/dream` command only works in the Unstable Diffusion image groups currently.",
    );
  }

  // The message text will be a combination of a prompt, and some flags.
  // The prompt will be the first part of the message, and the flags will be the rest.
  // The prompt can be text of any length.
  // Each flag will start with a `-` and will be followed by the name of the flag.
  // We will support flags starting with `--` just in case.
  let messageText = ctx.message?.text!;

  // First get rid of the command
  messageText = messageText.substring("/dream".length).trim();

  // There may not be any flags, but if there are we need to separate them from the prompt. Flags
  // start as soon as we hit a `-` character at the start of a word.
  const flagStringMatch = messageText.match(/(?:^|\s)-[a-zA-Z]/);
  let flagString = "";
  let prompt = messageText;
  if (flagStringMatch) {
    flagString = messageText.substring(flagStringMatch.index!);
    prompt = messageText.substring(0, flagStringMatch.index!).trim();
  }

  if (!prompt.trim()) {
    return await ctx.reply(
      "You need to provide a prompt for the dream command.",
    );
  }

  // Now parse the flags, using defaults.
  const flags = {
    quality: 3, // 1-5
    diversity: 0, // 0-1
    attention: 7, // 1-15
    seed: -1, // -1 for random
    width: 512, // 256-812
    height: 512, // 256-812
    restoreFaces: false,
    tiling: false,
    negativePrompt: "",
  };

  const errors: string[] = [];
  const matches = flagString.matchAll(flagRegex);

  for (const match of matches) {
    const flagName = match[1];
    const flagValue = match[2] || match[3];
    switch (flagName) {
      case "q":
      case "quality":
        if (!flagValue) errors.push("Quality flag must have a value.");
        if (flagValue && !/^[1-5]$/.test(flagValue)) {
          errors.push("Quality flag must be between 1 and 5.");
        }
        flags.quality = parseInt(flagValue);
        break;
      case "d":
      case "diversity":
        if (!flagValue) errors.push("Diversity flag must have a value.");
        if (flagValue && !/^[0-1](\.[0-9]+)?$/.test(flagValue)) {
          errors.push("Diversity flag must be between 0 and 1.");
        }
        flags.diversity = parseFloat(flagValue);
        break;
      case "a":
      case "attention":
        if (!flagValue) errors.push("Attention flag must have a value.");
        if (flagValue && !/^[1-9]$|^1[0-5]$/.test(flagValue)) {
          errors.push("Attention flag must be between 1 and 15.");
        }
        flags.attention = parseInt(flagValue);
        break;
      case "s":
      case "seed":
        if (!flagValue) errors.push("Seed flag must have a value.");
        if (flagValue && !/^[0-9]+$/.test(flagValue)) {
          errors.push("Seed flag must be a number.");
        }
        flags.seed = parseInt(flagValue);
        break;
      case "w":
      case "width":
        if (!flagValue) errors.push("Width flag must have a value.");
        if (flagValue && !/^[0-9]+$/.test(flagValue)) {
          errors.push("Width flag must be a number.");
        }
        if (
          flagValue && (parseInt(flagValue) < 256 || parseInt(flagValue) > 812)
        ) errors.push("Width flag must be between 256 and 812.");
        flags.width = parseInt(flagValue);
        break;
      case "h":
      case "height":
        if (!flagValue) errors.push("Height flag must have a value.");
        if (flagValue && !/^[0-9]+$/.test(flagValue)) {
          errors.push("Height flag must be a number.");
        }
        if (
          flagValue && (parseInt(flagValue) < 256 || parseInt(flagValue) > 812)
        ) errors.push("Height flag must be between 256 and 812.");
        flags.height = parseInt(flagValue);
        break;
      case "rf":
      case "restoreFaces":
        if (flagValue && !/^(true|false)$/.test(flagValue)) {
          errors.push("Restore faces flag must be true or false.");
        }
        flags.restoreFaces = (flagValue || "true") === "true";
        break;
      case "tile":
      case "tiling":
        if (flagValue && !/^(true|false)$/.test(flagValue)) {
          errors.push("Tiling flag must be true or false.");
        }
        flags.tiling = (flagValue || "true") === "true";
        break;
      case "no":
      case "neg":
      case "negativePrompt":
        if (!flagValue) errors.push("Negative prompt flag must have a value.");
        flags.negativePrompt = flagValue;
        break;
      default:
        errors.push(`Unknown flag: ${flagName}`);
    }
  }

  if (errors.length) {
    return ctx.reply(
      `*Error parsing flags:*\n${errors.join("\n")}`,
    );
  }

  // Now we need to build the actual object that will be sent to the API,
  // which means converting the properties like `quality` to things
  // the API can understand.

  // This is a map of quality values to steps.
  const qualityMap = [
    20,
    30,
    40,
    50,
    60,
  ];

  const apiObject: StableDiffusionProcessingTxt2Img = {
    prompt,
    negative_prompt: flags.negativePrompt + " " + defaultNegative,
    width: flags.width,
    height: flags.height,
    seed: flags.seed,
    sampler_name: "DPM++ 2M Karras",
    steps: qualityMap[flags.quality - 1],
    tiling: flags.tiling,
    restore_faces: flags.restoreFaces,
    subseed: -1,
    subseed_strength: flags.diversity,
    cfg_scale: flags.attention,
  };

  // The URL will be different depending on whether or not the user is
  // an admin. Admins will get a better GPU for testing.
  let endpoint = "http://localhost:7861";
  if (ctx.from?.id === 370663289) {
    endpoint = "http://localhost:7860";
  }

  // Now we need to send the request to the API.
  const helper = new SDHelper(endpoint);

  // Start the image generation.
  const img = helper.txt2img(apiObject) as Promise<TextToImageResponse>;
  const job = genQueue.add<TextToImageResponse>(img);

  const makeMessage = (pos: number) => {
    if (pos === 1) {
      return `*Generating image...*`;
    } else {
      return `*Generating image...*\n\nYou are currently in position ${pos} in the queue.\n\nPress the button below to cancel.`;
    }
  };

  // Send a message to the user telling them that we're working on it, what position
  // they are in the queue, and give them a cancel button.
  const message = await ctx.reply(makeMessage(job.position), {
    reply_markup: {
      inline_keyboard: [[{
        text: "Cancel",
        callback_data: `cancel_job:${job.id}`,
      }]],
    },
    reply_to_message_id: ctx.message?.message_id,
  });

  job.onPositionChange((pos) => {
    ctx.api.editMessageText(
      message.chat.id,
      message.message_id,
      makeMessage(pos),
    );
  });

  job.onCanceled(() => {
    ctx.api.editMessageText(
      message.chat.id,
      message.message_id,
      "*Canceled.*",
    );
  });

  // Now we need to wait for the image to be generated.
  // Once it's generated we can delete the message we sent earlier,
  // and send the image to the user.
  job.wait().then(async (imageResult) => {
    if (imageResult.images?.length) {
      const image: Uint8Array = imageResult.images[0] as unknown as Uint8Array;
      const inputFile = new InputFile(image, "dream.png");

      await ctx.api.deleteMessage(message.chat.id, message.message_id);
      await ctx.api.sendChatAction(message.chat.id, "upload_photo");

      const caption = "`" + messageText + "`";
      await ctx.replyWithPhoto(inputFile, {
        caption,
        reply_to_message_id: ctx.message?.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔍 Upscale", callback_data: `upscale:photo_id` },
              { text: "🔀 Re-run", callback_data: `rerun:photo_id` },
              { text: "🚫 Report", callback_data: `report:photo_id` },
            ],
          ],
        },
      });
    } else {
      await ctx.api.editMessageText(
        message.chat.id,
        message.message_id,
        `*Error generating image*\nThe API server may be down.`,
      );
    }
  });
});

bot.callbackQuery(/cancel_job:(.*)/, (ctx) => {
  const jobId = ctx.match[1];
  if (jobId) {
    genQueue.removeById(jobId);
  }
});
