import { load } from "dotenv";

export interface EnvConfig {
  BOT_TOKEN: string;
}

const env = (await load()) as unknown as EnvConfig;

const config = {
  botToken: env["BOT_TOKEN"],
};

export default config;
