import "dotenv/config";
import { db } from "@/server/db";
import { runIngest } from "@/server/services/ingest";

async function main() {
  const dayArg = process.argv
    .find((arg) => arg.startsWith("--day="))
    ?.slice("--day=".length);

  const day = dayArg ? new Date(`${dayArg}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(day.getTime())) {
    throw new Error(`Invalid --day value: ${dayArg}`);
  }

  const report = await runIngest(db, { day });

  console.log(
    `ingest ${report.day}: ${report.processed} approved submission(s), ` +
      `${report.inserted} inserted, ${report.skipped} already captured, ` +
      `${report.failed.length} failed`,
  );

  for (const failure of report.failed) {
    console.error(`  failed ${failure.submissionId}: ${failure.error}`);
  }

  // A partial run is still a failed run as far as a scheduler is concerned.
  process.exit(report.failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
