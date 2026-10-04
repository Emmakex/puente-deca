import {
  openKairosethMongoClient
} from "../../packages/persistence/src/mongo-client.mjs";
import {
  buildAggregateForLegacyShipment
} from "../../packages/core/src/shipment-migration.mjs";

const APPLY_CONFIRMATION =
  "BACKFILL_GENERIC_SHIPMENT_AGGREGATES";

const requireText = (
  value,
  name
) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    const error = new Error(
      `${name} is required`
    );
    error.code =
      "SHIPMENT_BACKFILL_CONFIGURATION_INVALID";
    throw error;
  }

  return value.trim();
};

const parseLimit = (
  value,
  fallback
) => {
  const parsed =
    Number.parseInt(
      String(value ?? ""),
      10
    );

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(
    10_000,
    parsed
  );
};

const mode =
  (
    process.env
      .SHIPMENT_AGGREGATE_BACKFILL_MODE ??
    "inspect"
  )
    .trim()
    .toLowerCase();

if (
  ![
    "inspect",
    "apply"
  ].includes(mode)
) {
  const error = new Error(
    "SHIPMENT_AGGREGATE_BACKFILL_MODE must be inspect or apply"
  );
  error.code =
    "SHIPMENT_BACKFILL_MODE_INVALID";
  throw error;
}

const apply =
  mode === "apply";

if (
  apply &&
  process.env
    .SHIPMENT_AGGREGATE_BACKFILL_CONFIRM !==
    APPLY_CONFIRMATION
) {
  const error = new Error(
    "Apply mode requires explicit backfill confirmation"
  );
  error.code =
    "SHIPMENT_BACKFILL_CONFIRMATION_REQUIRED";
  throw error;
}

const uri = requireText(
  process.env.MONGODB_URI,
  "MONGODB_URI"
);
const databaseName =
  requireText(
    process.env.MONGODB_DB_NAME,
    "MONGODB_DB_NAME"
  );

if (
  databaseName !== "kairoseth"
) {
  const error = new Error(
    "Shipment backfill target database must be kairoseth"
  );
  error.code =
    "SHIPMENT_BACKFILL_DATABASE_INVALID";
  throw error;
}

const limit =
  parseLimit(
    process.env
      .SHIPMENT_AGGREGATE_BACKFILL_LIMIT,
    1000
  );

const missingAggregateFilter = {
  $or: [
    {
      aggregate: {
        $exists: false
      }
    },
    {
      aggregate: null
    }
  ]
};

let client = null;

try {
  client =
    await openKairosethMongoClient({
      uri,
      appName:
        "kairoseth-puente-deca-shipment-backfill"
    });

  const database =
    client.db(databaseName);
  const collection =
    database.collection(
      "deca_shipments"
    );

  const before =
    await collection
      .countDocuments(
        missingAggregateFilter
      );

  const candidates =
    await collection
      .find(
        missingAggregateFilter,
        {
          projection: {
            _id: 1,
            shipmentId: 1,
            externalReference: 1,
            data: 1
          }
        }
      )
      .sort({
        _id: 1
      })
      .limit(limit)
      .toArray();

  const prepared = [];
  const invalid = [];

  for (
    const shipment of
    candidates
  ) {
    try {
      const result =
        buildAggregateForLegacyShipment(
          shipment
        );

      prepared.push({
        _id: shipment._id,
        shipmentId:
          shipment.shipmentId ?? null,
        aggregate:
          result.aggregate
      });
    } catch (error) {
      invalid.push({
        shipmentId:
          typeof shipment.shipmentId ===
            "string"
            ? shipment.shipmentId
            : null,
        code:
          typeof error?.code ===
            "string"
            ? error.code
            : "SHIPMENT_MIGRATION_FAILED"
      });
    }
  }

  if (
    invalid.length > 0
  ) {
    const error = new Error(
      "Legacy shipment validation blocked aggregate backfill"
    );
    error.code =
      "SHIPMENT_BACKFILL_BLOCKED";
    error.invalid =
      invalid.slice(0, 25);
    error.invalidCount =
      invalid.length;
    throw error;
  }

  let updated = 0;
  let skippedConcurrent = 0;

  if (apply) {
    for (
      const candidate of
      prepared
    ) {
      const result =
        await collection
          .updateOne(
            {
              _id:
                candidate._id,
              ...missingAggregateFilter
            },
            {
              $set: {
                aggregate:
                  candidate.aggregate
              }
            }
          );

      if (
        result.modifiedCount === 1
      ) {
        updated += 1;
      } else {
        skippedConcurrent += 1;
      }
    }
  }

  const after =
    apply
      ? await collection
          .countDocuments(
            missingAggregateFilter
          )
      : before;

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "shipment-aggregate-backfill",
        mode,
        database:
          databaseName,
        collection:
          "deca_shipments",
        limit,
        missingBefore:
          before,
        inspected:
          candidates.length,
        validCandidates:
          prepared.length,
        invalidCandidates: 0,
        updated,
        skippedConcurrent,
        missingAfter:
          after,
        complete:
          after === 0,
        confirmationRequired:
          !apply
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "shipment-aggregate-backfill",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "SHIPMENT_BACKFILL_FAILED",
      invalidCount:
        Number.isInteger(
          error?.invalidCount
        )
          ? error.invalidCount
          : undefined,
      invalid:
        Array.isArray(
          error?.invalid
        )
          ? error.invalid
          : undefined
    })}\n`
  );

  process.exitCode = 1;
} finally {
  if (client) {
    await client.close()
      .catch(
        () => undefined
      );
  }
}
