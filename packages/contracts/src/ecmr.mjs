export const ECMR_CONTRACT_VERSION = "2026-10";
export const ECMR_UNCEFACT_RELEASE = "D25A";

export const emptyEcmrProjection = () => ({
  contractVersion:
    ECMR_CONTRACT_VERSION,
  documentType: "eCMR",
  messageStandard:
    "UN/CEFACT eCMR",
  messageRelease:
    ECMR_UNCEFACT_RELEASE,
  externalReference: "",
  issue: {
    date: "",
    place: ""
  },
  sender: {
    legalName: "",
    address: ""
  },
  contractualCarrier: {
    legalName: "",
    address: ""
  },
  takingOver: {
    place: "",
    date: ""
  },
  delivery: {
    place: ""
  },
  consignee: {
    legalName: "",
    address: ""
  },
  goods: {
    nature: "",
    packingMethod: "",
    dangerousGoodsDescription:
      null,
    packages: {
      count: null,
      marksAndNumbers: []
    },
    quantity: null
  },
  charges: {
    declared: false,
    items: []
  },
  customsFormalities: {
    declared: false,
    instructions: []
  },
  conventionApplicability: {
    convention: "CMR",
    declared: false
  },
  authentication: {
    state: "pending",
    method: null,
    signatures: []
  },
  integrity: {
    state: "pending",
    contentHash: null,
    amendmentHistoryPreserved:
      false
  }
});
