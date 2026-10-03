export const DECA_CONTRACT_VERSION = "2026-06";

export const emptyDecaRequest = () => ({
  externalReference: "",
  contractualShipper: {
    legalName: "",
    taxId: "",
    address: ""
  },
  effectiveCarrier: {
    legalName: "",
    taxId: ""
  },
  route: {
    origin: "",
    destination: ""
  },
  goods: {
    nature: "",
    weight: {
      value: null,
      unit: "kg"
    }
  },
  transport: {
    date: "",
    vehicle: {
      tractorRegistration: "",
      trailerRegistration: null
    },
    specialTrafficAuthorization: null
  },
  observations: null
});
