import { buildRunConfig } from "./config.js";
import { formatCalculationAuditSummary, runCalculationAudit } from "./audit/calcAudit.js";

async function main(): Promise<void> {
  const argv = ["--telegram", "false", "--console", "false", ...process.argv.slice(2)];
  const config = buildRunConfig(argv, process.env);
  const summary = await runCalculationAudit(config);
  process.stdout.write(`${formatCalculationAuditSummary(summary)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
