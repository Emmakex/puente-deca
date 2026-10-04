export const SHIPMENT_CONTRACT_VERSION = "2026-10";

export const emptyShipmentAggregate = () => ({
  contractVersion:
    SHIPMENT_CONTRACT_VERSION,
  externalReference: "",
  transportMode: "road",
  parties: [],
  route: {
    origin: "",
    destination: ""
  },
  cargo: {
    nature: "",
    measures: []
  },
  movement: {
    date: "",
    equipment: {},
    authorizations: {}
  },
  notes: null,
  regulatoryContexts: [],
  extensions: {}
});
