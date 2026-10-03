import {
  validateProductionEnvironment
} from "../../apps/api/src/production-preflight.mjs";

const result =
  validateProductionEnvironment(
    process.env
  );

process.stdout.write(
  `${JSON.stringify(result, null, 2)}\n`
);

if (!result.valid) {
  process.exitCode = 1;
}
