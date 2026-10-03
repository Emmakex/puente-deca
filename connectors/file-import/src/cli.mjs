import { readFile } from "node:fs/promises";
import { importCsvText } from "./import.mjs";

const filePath = process.argv[2];

if (!filePath) {
  console.error(
    "Usage: node connectors/file-import/src/cli.mjs <shipments.csv>"
  );
  process.exitCode = 2;
} else {
  const text = await readFile(
    filePath,
    "utf8"
  );
  const result = importCsvText(text);

  process.stdout.write(
    `${JSON.stringify(result, null, 2)}\n`
  );

  if (result.invalid > 0) {
    process.exitCode = 1;
  }
}
