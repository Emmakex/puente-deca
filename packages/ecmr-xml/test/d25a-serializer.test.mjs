import test from "node:test";
import assert from "node:assert/strict";

import {
  serializeEcmrD25aEnvelope
} from "../src/d25a-serializer.mjs";
import {
  ECMR_D25A_PROFILE
} from "../src/d25a-profile.mjs";

const projection = () => ({
  contractVersion: "2026-10",
  documentType: "eCMR",
  messageStandard:
    "UN/CEFACT eCMR",
  messageRelease: "D25A",
  externalReference:
    "ECMR<&>\"-001",
  issue: {
    date: "2026-10-04",
    place: "Madrid & Centro"
  },
  sender: {
    legalName: "Sender <SL>",
    address: "Calle Uno & Dos"
  },
  contractualCarrier: {
    legalName:
      "Carrier SL",
    address:
      "Barcelona"
  },
  takingOver: {
    place: "Madrid",
    date: "2026-10-05"
  },
  delivery: {
    place: "Lyon"
  },
  consignee: {
    legalName:
      "Consignee SAS",
    address: "Lyon"
  },
  goods: {
    nature: "Furniture",
    packingMethod:
      "Pallets",
    packingMethodCode:
      "PX",
    dangerousGoodsDescription:
      null,
    dangerousGoods: {
      declared: true,
      undgIdentificationCode:
        "1203",
      regulationCode:
        "ADR",
      technicalName:
        "Gasoline",
      properShippingName:
        "GASOLINE",
      packagingDangerLevelCode:
        "II",
      hazardClassificationId:
        "3"
    },
    packages: {
      count: 8,
      marksAndNumbers: [
        "PAL-1",
        "PAL-8"
      ]
    },
    quantity: {
      kind: "weight",
      value: 420,
      unit: "kg"
    }
  },
  charges: {
    declared: true,
    items: [
      {
        id: "FREIGHT",
        description:
          "Freight & handling",
        chargeCategoryCode:
          null,
        amount: {
          value: 125.5,
          currency: "EUR"
        },
        payingPartyRoleCode:
          null,
        transportPaymentMethodCode:
          null
      }
    ]
  },
  customsFormalities: {
    declared: true,
    instructions: [
      "Present MRN & invoice"
    ]
  },
  conventionApplicability: {
    convention: "CMR",
    declared: true,
    statement:
      "This carriage is subject to the CMR Convention notwithstanding any clause to the contrary."
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

test(
  "pins the official UNECE D25A package identity and root XSD",
  () => {
    assert.equal(
      ECMR_D25A_PROFILE
        .sourceFileName,
      "eCMR_D25A.zip"
    );
    assert.equal(
      ECMR_D25A_PROFILE
        .sourceFileId,
      473769
    );
    assert.equal(
      ECMR_D25A_PROFILE
        .nestedSchemaArchive,
      "XSD/Schema.zip"
    );
    assert.equal(
      ECMR_D25A_PROFILE
        .rootSchema,
      "uncefact/eCMR_100pD25A.xsd"
    );
  }
);

test(
  "serializes a deterministic namespace-pinned UN/CEFACT eCMR envelope",
  () => {
    const first =
      serializeEcmrD25aEnvelope(
        projection()
      );
    const second =
      serializeEcmrD25aEnvelope(
        projection()
      );

    assert.equal(
      first.xml,
      second.xml
    );
    assert.match(
      first.xml,
      /<rsm:eCMR /
    );
    assert.match(
      first.xml,
      /urn:un:unece:uncefact:data:standard:eCMR:100/
    );
    assert.match(
      first.xml,
      /<rsm:ExchangedDocument>/
    );
    assert.match(
      first.xml,
      /<rsm:SpecifiedSupplyChainConsignment>/
    );
    assert.match(
      first.xml,
      /<ram:ConsignorTradeParty>/
    );
    assert.match(
      first.xml,
      /<ram:CarrierTradeParty>/
    );
    assert.match(
      first.xml,
      /<ram:ConsigneeTradeParty>/
    );
    assert.match(
      first.xml,
      /<ram:CarrierAcceptanceLogisticsLocation>/
    );
    assert.match(
      first.xml,
      /<ram:ConsigneeReceiptLogisticsLocation>/
    );
    assert.match(
      first.xml,
      /<ram:GrossWeightMeasure unitCode="KGM">420<\/ram:GrossWeightMeasure>/
    );
    assert.match(
      first.xml,
      /<ram:ConsignmentItemQuantity>8<\/ram:ConsignmentItemQuantity>/
    );
    assert.match(
      first.xml,
      /<ram:PickUpTransportEvent><ram:ActualOccurrenceDateTime><udt:DateTimeString format="102">20261005<\/udt:DateTimeString><\/ram:ActualOccurrenceDateTime><\/ram:PickUpTransportEvent>/
    );
    assert.match(
      first.xml,
      /<ram:IncludedSupplyChainConsignmentItem>/
    );
    assert.match(
      first.xml,
      /<ram:SequenceNumeric>1<\/ram:SequenceNumeric>/
    );
    assert.match(
      first.xml,
      /<ram:NatureIdentificationTransportCargo><ram:Identification>Furniture<\/ram:Identification><\/ram:NatureIdentificationTransportCargo>/
    );
    assert.match(
      first.xml,
      /<ram:TransportLogisticsPackage>/
    );
    assert.match(
      first.xml,
      /<ram:ItemQuantity>8<\/ram:ItemQuantity>/
    );
    assert.match(
      first.xml,
      /<ram:TypeCode>PX<\/ram:TypeCode>/
    );
    assert.match(
      first.xml,
      /<ram:TypeText>Pallets<\/ram:TypeText>/
    );
    assert.match(
      first.xml,
      /<ram:ApplicableTransportDangerousGoods>/
    );
    assert.match(
      first.xml,
      /<ram:UNDGIdentificationCode>1203<\/ram:UNDGIdentificationCode>/
    );
    assert.match(
      first.xml,
      /<ram:RegulationCode>ADR<\/ram:RegulationCode>/
    );
    assert.match(
      first.xml,
      /<ram:TechnicalName>Gasoline<\/ram:TechnicalName>/
    );
    assert.match(
      first.xml,
      /<ram:ProperShippingName>GASOLINE<\/ram:ProperShippingName>/
    );
    assert.match(
      first.xml,
      /<ram:PackagingDangerLevelCode>II<\/ram:PackagingDangerLevelCode>/
    );
    assert.match(
      first.xml,
      /<ram:HazardClassificationID>3<\/ram:HazardClassificationID>/
    );
    assert.match(
      first.xml,
      /<ram:PhysicalLogisticsShippingMarks><ram:Marking>PAL-1<\/ram:Marking><\/ram:PhysicalLogisticsShippingMarks>/
    );
    assert.match(
      first.xml,
      /<ram:PhysicalLogisticsShippingMarks><ram:Marking>PAL-8<\/ram:Marking><\/ram:PhysicalLogisticsShippingMarks>/
    );
    assert.match(
      first.xml,
      /<ram:ApplicableLogisticsServiceCharge>/
    );
    assert.match(
      first.xml,
      /<ram:ID>FREIGHT<\/ram:ID>/
    );
    assert.match(
      first.xml,
      /<ram:Description>Freight &amp; handling<\/ram:Description>/
    );
    assert.match(
      first.xml,
      /<ram:AppliedAmount currencyID="EUR">125.5<\/ram:AppliedAmount>/
    );
    assert.match(
      first.xml,
      /<ram:ConsignorProvidedBorderClearanceTransportInstructions><ram:Description>Present MRN &amp; invoice<\/ram:Description><\/ram:ConsignorProvidedBorderClearanceTransportInstructions>/
    );
    assert.match(
      first.xml,
      /<ram:ContractualDocumentClause><ram:Content>This carriage is subject to the CMR Convention notwithstanding any clause to the contrary\.<\/ram:Content><\/ram:ContractualDocumentClause>/
    );
  }
);

test(
  "escapes XML-sensitive legal/business text",
  () => {
    const output =
      serializeEcmrD25aEnvelope(
        projection()
      ).xml;

    assert.ok(
      !output.includes(
        "Sender <SL>"
      )
    );
    assert.match(
      output,
      /Sender &lt;SL&gt;/
    );
    assert.match(
      output,
      /Madrid &amp; Centro/
    );
    assert.match(
      output,
      /ECMR&lt;&amp;&gt;&quot;-001/
    );
  }
);

test(
  "keeps packing text and explicit package code semantically separate",
  () => {
    const output =
      serializeEcmrD25aEnvelope(
        projection()
      );

    assert.ok(
      !output.xml.includes(
        "<ram:TypeCode>Pallets</ram:TypeCode>"
      )
    );
    assert.match(
      output.xml,
      /<ram:TypeCode>PX<\/ram:TypeCode>/
    );
    assert.match(
      output.xml,
      /<ram:TypeText>Pallets<\/ram:TypeText>/
    );
  }
);

test(
  "keeps schema conformance explicitly pending until official XSD validation runs",
  () => {
    const output =
      serializeEcmrD25aEnvelope(
        projection()
      );

    assert.equal(
      output.schemaConformance,
      "pending-official-xsd-validation"
    );
    assert.ok(
      output.pendingProjectionPaths
        .includes(
          "authentication"
        )
    );
    for (const mapped of [
      "takingOver.date",
      "goods.nature",
      "goods.packages.marksAndNumbers",
      "goods.packingMethod",
      "goods.packingMethodCode",
      "goods.dangerousGoods",
      "charges",
      "customsFormalities",
      "conventionApplicability"
    ]) {
      assert.ok(
        output.mappedProjectionPaths
          .includes(mapped)
      );
      assert.ok(
        !output.pendingProjectionPaths
          .includes(mapped)
      );
    }
  }
);
