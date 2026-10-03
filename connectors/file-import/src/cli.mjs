import {
  readFile
} from "node:fs/promises";
import {
  extname
} from "node:path";
import {
  importCsvText
} from "./import.mjs";
import {
  importXlsx
} from "./xlsx.mjs";

const filePath = process.argv[2];

if (!filePath) {
  console.error(
    "Usage: node connectors/file-import/src/cli.mjs <shipments.csv|shipments.xlsx>"
  );
  process.exitCode = 2;
} else {
  const extension =
    extname(filePath).toLowerCase();

  let result;

  if (extension === ".csv") {
    const text = await readFile(
      filePath,
      "utf8"
    );
    result = importCsvText(text);
  } else if (extension === ".xlsx") {
    result = await importXlsx(filePath);
  } else {
    console.error(
      "Unsupported file type. Use .csv or .xlsx"
    );
    process.exitCode = 2;
  }

  if (result) {
    process.stdout.write(
      `${JSON.stringify(result, null, 2)}\n`
    );

    if (result.invalid > 0) {
      process.exitCode = 1;
    }
  }
}
