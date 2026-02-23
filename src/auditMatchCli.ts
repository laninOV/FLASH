import { buildRunConfig } from "./config.js";
import { formatMatchTrace, runMatchTrace } from "./audit/matchTrace.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const config = buildRunConfig(
    ["--telegram", "false", "--console", "false", ...argv],
    process.env,
  );

  const matchUrl = readArg(argv, "match-url");
  const playerAName = readArg(argv, "player-a");
  const playerBName = readArg(argv, "player-b");

  if (!matchUrl || !playerAName || !playerBName) {
    throw new Error(
      "Usage: npm run audit:match -- --match-url <url> --player-a <name> --player-b <name>",
    );
  }

  const trace = await runMatchTrace(config, {
    matchUrl,
    playerAName,
    playerBName,
  });
  process.stdout.write(`${formatMatchTrace(trace)}\n`);
}

function readArg(argv: string[], key: string): string | undefined {
  const token = `--${key}`;
  const index = argv.findIndex((value) => value === token);
  if (index < 0) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
