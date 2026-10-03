import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const CONNECTOR_PACKAGES = {
  woocommerce: {
    filename: "puente-deca-woocommerce-0.1.0.zip",
    root: "puente-deca-woocommerce",
    files: [
      ["connectors/woocommerce/puente-deca-woocommerce.php", "puente-deca-woocommerce.php"],
      ["connectors/woocommerce/includes/class-pdeca-woo-client.php", "includes/class-pdeca-woo-client.php"],
      ["connectors/woocommerce/includes/class-pdeca-woo-connector.php", "includes/class-pdeca-woo-connector.php"],
      ["connectors/woocommerce/includes/class-pdeca-woo-order-payload.php", "includes/class-pdeca-woo-order-payload.php"],
      ["connectors/woocommerce/includes/class-pdeca-woo-secret-store.php", "includes/class-pdeca-woo-secret-store.php"],
      ["connectors/woocommerce/includes/class-pdeca-woo-settings.php", "includes/class-pdeca-woo-settings.php"]
    ]
  },
  prestashop: {
    filename: "puentedeca-prestashop-0.1.0.zip",
    root: "puentedeca",
    files: [
      ["connectors/prestashop/puentedeca.php", "puentedeca.php"],
      ["connectors/prestashop/classes/PDECAPrestaShopClient.php", "classes/PDECAPrestaShopClient.php"],
      ["connectors/prestashop/classes/PDECAPrestaShopConnector.php", "classes/PDECAPrestaShopConnector.php"],
      ["connectors/prestashop/classes/PDECAPrestaShopOrderPayload.php", "classes/PDECAPrestaShopOrderPayload.php"],
      ["connectors/prestashop/classes/PDECAPrestaShopSecretStore.php", "classes/PDECAPrestaShopSecretStore.php"]
    ]
  }
};

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0
      ? 0xedb88320 ^ (crc >>> 1)
      : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localHeader(name, bytes, crc) {
  const nameBytes = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(bytes.length, 18);
  header.writeUInt32LE(bytes.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBytes, bytes]);
}

function centralHeader(name, bytes, crc, offset) {
  const nameBytes = Buffer.from(name, "utf8");
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(33, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(bytes.length, 20);
  header.writeUInt32LE(bytes.length, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBytes]);
}

function endOfCentralDirectory(entries, centralSize, centralOffset) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entries, 8);
  footer.writeUInt16LE(entries, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

async function buildZip(definition) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [source, destination] of definition.files) {
    const bytes = await readFile(join(process.cwd(), source));
    const name = `${definition.root}/${destination}`;
    const crc = crc32(bytes);
    const local = localHeader(name, bytes, crc);
    localParts.push(local);
    centralParts.push(
      centralHeader(name, bytes, crc, offset)
    );
    offset += local.length;
  }

  const central = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    central,
    endOfCentralDirectory(
      definition.files.length,
      central.length,
      offset
    )
  ]);
}

export function supportedConnectorPackage(connector) {
  return Object.prototype.hasOwnProperty.call(
    CONNECTOR_PACKAGES,
    connector
  );
}

export async function createConnectorPackage(connector) {
  const definition = CONNECTOR_PACKAGES[connector];
  if (!definition) {
    const error = new Error("Unsupported connector package");
    error.code = "CONNECTOR_PACKAGE_NOT_FOUND";
    throw error;
  }

  const bytes = await buildZip(definition);
  return {
    filename: definition.filename,
    bytes,
    sha256: createHash("sha256")
      .update(bytes)
      .digest("hex")
  };
}
