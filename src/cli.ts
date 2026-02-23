import { buildRunConfig } from "./config.js";
import { run } from "./orchestrator.js";

async function main(): Promise<void> {
  const config = buildRunConfig(process.argv.slice(2), process.env);
  const summary = await run(config);
  process.stdout.write(
    `Finished. processed=${summary.processedMatches} predicted=${summary.predictedMatches} ` +
      `errors=${summary.parserErrors} telegramFailures=${summary.telegramFailures}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});

