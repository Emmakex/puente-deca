import {
  readFile
} from "node:fs/promises";
import {
  pathToFileURL
} from "node:url";
import {
  resolve
} from "node:path";
import {
  runConnectorContract
} from "./contract.mjs";

const [modulePath, fixturePath] =
  process.argv.slice(2);

if (!modulePath || !fixturePath) {
  console.error(
    "Usage: node packages/connector-contract-suite/src/cli.mjs <connector.mjs> <fixture.json>"
  );
  process.exitCode = 2;
} else {
  const imported = await import(
    pathToFileURL(
      resolve(modulePath)
    ).href
  );
  const connector =
    imported.default ?? imported.connector;
  const fixture = JSON.parse(
    await readFile(
      resolve(fixturePath),
      "utf8"
    )
  );

  const result =
    await runConnectorContract({
      connector,
      fixture
    });

  process.stdout.write(
    `${JSON.stringify(result, null, 2)}\n`
  );
}
