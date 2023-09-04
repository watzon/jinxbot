import { Bot, Context } from "grammy";
import constants from "./constants.ts";
import {
  hydrateReply,
  parseMode,
  type ParseModeFlavor,
} from "@grammyjs/parse-mode";

export interface BotContext extends Context {}

export type BotFlavor = ParseModeFlavor<BotContext>;

export const bot = new Bot<BotFlavor>(constants.botToken);

bot.use(hydrateReply);
bot.api.config.use(parseMode("Markdown"));

bot.catch((err) => {
  console.error(err);
});
