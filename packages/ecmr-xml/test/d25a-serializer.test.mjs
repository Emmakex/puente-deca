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
    dangerousGoodsDescription:
      null,
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
    items: []
  },
  customsFormalities: {
    declared: true,
    instructions: []
  },
  conventionApplicability: {
    convention: "CMR",
    declared: true
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
      /<ram:PhysicalLogisticsShippingMarks><ram:Marking>PAL-1<\/ram:Marking><\/ram:PhysicalLogisticsShippingMarks>/
    );
    assert.match(
      first.xml,
      /<ram:PhysicalLogisticsShippingMarks><ram:Marking>PAL-8<\/ram:Marking><\/ram:PhysicalLogisticsShippingMarks>/
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
    assert.ok(
      output.pendingProjectionPaths
        .includes(
          "charges"
        )
    );
    for (const mapped of [
      "takingOver.date",
      "goods.nature",
      "goods.packages.marksAndNumbers"
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
