#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { RemoteClaudeApp } from "../src/index.js";

const CONFIG_DIR = join(homedir(), ".remote-claude");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  server: string;
}

function loadConfig(): Config {
  if (existsSync(CONFIG_FILE)) {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  }
  return { server: "ws://localhost:8080" };
}

function saveConfig(config: Config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const program = new Command();

program
  .name("remote-claude")
  .description("Remote control Claude Code from your phone")
  .version("0.1.0");

program
  .command("start")
  .description("Start Claude Code with remote control enabled")
  .option("-s, --server <url>", "Relay server URL")
  .action(async (opts) => {
    const config = loadConfig();
    const serverUrl = opts.server || config.server;

    const app = new RemoteClaudeApp(serverUrl);
    await app.start();
  });

program
  .command("config")
  .description("Configure remote-claude")
  .option("--server <url>", "Set relay server URL")
  .action((opts) => {
    const config = loadConfig();
    if (opts.server) {
      config.server = opts.server;
      saveConfig(config);
      console.log(chalk.green(`Server URL set to: ${opts.server}`));
    } else {
      console.log("Current config:");
      console.log(JSON.stringify(config, null, 2));
    }
  });

// Default action: start
program.action(async () => {
  const config = loadConfig();
  const app = new RemoteClaudeApp(config.server);
  await app.start();
});

program.parse();
