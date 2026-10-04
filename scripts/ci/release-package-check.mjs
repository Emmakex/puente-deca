import {
  mkdir,
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHash
} from "node:crypto";
import {
  spawnSync
} from "node:child_process";

const root = process.cwd();
const directory = await mkdtemp(
  join(tmpdir(), "pdeca-release-")
);
const first = join(directory, "first");
const second = join(directory, "second");

const run = (args, options = {}) => {
  const result = spawnSync(
    args[0],
    args.slice(1),
    {
      cwd: root,
      encoding: "utf8",
      ...options
    }
  );

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${args.join(" ")}`,
        result.stdout,
        result.stderr
      ].join("\n")
    );
  }

  return result.stdout;
};

const sha256 = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

try {
  run([
    "bash",
    "scripts/release/package-connectors.sh",
    first
  ]);
  run([
    "bash",
    "scripts/release/package-connectors.sh",
    second
  ]);

  const packages = [
    {
      name:
        "puente-deca-woocommerce-0.1.0.zip",
      root: "puente-deca-woocommerce/",
      required: [
        "puente-deca-woocommerce/puente-deca-woocommerce.php",
        "puente-deca-woocommerce/includes/class-pdeca-woo-client.php",
        "puente-deca-woocommerce/includes/class-pdeca-woo-connector.php",
        "puente-deca-woocommerce/includes/class-pdeca-woo-order-payload.php",
        "puente-deca-woocommerce/includes/class-pdeca-woo-secret-store.php",
        "puente-deca-woocommerce/includes/class-pdeca-woo-settings.php"
      ]
    },
    {
      name:
        "puentedeca-prestashop-0.1.0.zip",
      root: "puentedeca/",
      required: [
        "puentedeca/puentedeca.php",
        "puentedeca/classes/PDECAPrestaShopClient.php",
        "puentedeca/classes/PDECAPrestaShopConnector.php",
        "puentedeca/classes/PDECAPrestaShopOrderPayload.php",
        "puentedeca/classes/PDECAPrestaShopSecretStore.php"
      ]
    }
  ];

  for (const item of packages) {
    const firstPath = join(first, item.name);
    const secondPath = join(
      second,
      item.name
    );

    const [firstHash, secondHash] =
      await Promise.all([
        sha256(firstPath),
        sha256(secondPath)
      ]);

    if (firstHash !== secondHash) {
      throw new Error(
        `${item.name} is not reproducible`
      );
    }

    const entries = run([
      "unzip",
      "-Z1",
      firstPath
    ])
      .trim()
      .split("\n")
      .filter(Boolean);

    if (
      entries.some(
        (entry) =>
          !entry.startsWith(item.root)
      )
    ) {
      throw new Error(
        `${item.name} contains files outside ${item.root}`
      );
    }

    for (const required of item.required) {
      if (!entries.includes(required)) {
        throw new Error(
          `${item.name} is missing ${required}`
        );
      }
    }

    if (
      entries.some(
        (entry) =>
          /(?:README\.md|contract\.mjs)$/i.test(
            entry
          )
      )
    ) {
      throw new Error(
        `${item.name} contains development-only files`
      );
    }
  }

  const runtime = join(
    directory,
    "runtime"
  );
  await mkdir(runtime, {
    recursive: true
  });

  const wooPackage = join(
    first,
    "puente-deca-woocommerce-0.1.0.zip"
  );
  const prestaPackage = join(
    first,
    "puentedeca-prestashop-0.1.0.zip"
  );

  run([
    "unzip",
    "-q",
    wooPackage,
    "-d",
    runtime
  ]);
  run([
    "unzip",
    "-q",
    prestaPackage,
    "-d",
    runtime
  ]);

  const packagedSmokeOutput = run(
    [
      "bash",
      "scripts/ci/connector-bootstrap-smoke.sh"
    ],
    {
      env: {
        ...process.env,
        PDECA_WOO_PLUGIN_FILE:
          join(
            runtime,
            "puente-deca-woocommerce",
            "puente-deca-woocommerce.php"
          ),
        PDECA_PS_MODULE_FILE:
          join(
            runtime,
            "puentedeca",
            "puentedeca.php"
          )
      }
    }
  );

  if (
    !packagedSmokeOutput.includes(
      "Connector PHP bootstrap acceptance passed."
    )
  ) {
    throw new Error(
      "Extracted connector runtime smoke did not complete"
    );
  }

  const sums =
    await readFile(
      join(first, "SHA256SUMS"),
      "utf8"
    );

  if (
    !sums.includes(
      "puente-deca-woocommerce-0.1.0.zip"
    ) ||
    !sums.includes(
      "puentedeca-prestashop-0.1.0.zip"
    )
  ) {
    throw new Error(
      "Release checksum manifest is incomplete"
    );
  }

  console.log(
    "Connector release packaging OK (stable top-level folders, deterministic ZIP bytes, SHA-256 manifest, extracted PHP runtime smoke)"
  );
} finally {
  await rm(directory, {
    recursive: true,
    force: true
  });
}
