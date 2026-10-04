export const ECMR_D25A_PROFILE = Object.freeze({
  release: "D25A",
  publishedOn: "2026-06-11",
  sourcePage:
    "https://unece.org/trade/documents/2026/06/ecmr-d25a",
  sourceFileName:
    "eCMR_D25A.zip",
  sourceFileId: 473769,
  nestedSchemaArchive:
    "XSD/Schema.zip",
  rootSchema:
    "uncefact/eCMR_100pD25A.xsd",
  namespaces: Object.freeze({
    rsm:
      "urn:un:unece:uncefact:data:standard:eCMR:100",
    ram:
      "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    qdt:
      "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
    udt:
      "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  })
});

export const ECMR_D25A_CONFIRMED_WIRE_NODES =
  Object.freeze([
    "eCMR",
    "ExchangedDocumentContext",
    "ExchangedDocument",
    "SpecifiedSupplyChainConsignment",
    "ConsignorTradeParty",
    "ConsigneeTradeParty",
    "CarrierTradeParty",
    "CarrierAcceptanceLogisticsLocation",
    "ConsigneeReceiptLogisticsLocation",
    "PickUpTransportEvent",
    "ActualOccurrenceDateTime",
    "IncludedSupplyChainConsignmentItem",
    "SequenceNumeric",
    "NatureIdentificationTransportCargo",
    "Identification",
    "ApplicableTransportDangerousGoods",
    "UNDGIdentificationCode",
    "RegulationCode",
    "TechnicalName",
    "ProperShippingName",
    "PackagingDangerLevelCode",
    "HazardClassificationID",
    "TransportLogisticsPackage",
    "ItemQuantity",
    "TypeCode",
    "TypeText",
    "PhysicalLogisticsShippingMarks",
    "Marking",
    "GrossWeightMeasure",
    "ConsignmentItemQuantity",
    "ApplicableLogisticsServiceCharge",
    "Description",
    "AppliedAmount",
    "ChargeCategoryCode",
    "PayingPartyRoleCode",
    "TransportPaymentMethodCode",
    "ConsignorProvidedBorderClearanceTransportInstructions",
    "ContractualDocumentClause",
    "Content"
  ]);
