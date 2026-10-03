import {
  rowToDecaRequest
} from "./src/import.mjs";

const connector = {
  id: "file-import",
  version: "1.0.0",
  capabilities: [
    "shipment.import"
  ],

  async mapShipment(source) {
    return rowToDecaRequest(
      structuredClone(source)
    );
  }
};

export default connector;
