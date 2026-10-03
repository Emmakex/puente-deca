const connector = {
  id: "reference",
  version: "1.0.0",
  capabilities: [
    "shipment.import"
  ],

  async mapShipment(source) {
    return structuredClone(source);
  }
};

export default connector;
