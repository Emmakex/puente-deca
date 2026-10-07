import {
  validateProductionEnvironment
} from "../../apps/api/src/production-preflight.mjs";

const parseTopology = (argv) => {
  if (argv.length === 0) return "standalone";
  if (argv.length !== 1 || !argv[0].startsWith("--topology=")) {
    throw new Error(
      "production preflight accepts only --topology=standalone|in-process"
    );
  }
  return argv[0].slice("--topology=".length);
};

let result;
try {
  const topology = parseTopology(process.argv.slice(2));
  result = validateProductionEnvironment(
    process.env,
    { topology }
  );
} catch (error) {
  result = {
    valid: false,
    errors: [
      error instanceof Error
        ? error.message
        : "Production topology is invalid."
    ],
    warnings: [],
    target: {
      topology: null,
      publicBaseUrl: null,
      database: null,
      artifactBucket: null,
      port: null
    }
  };
}

process.stdout.write(
  `${JSON.stringify(result, null, 2)}\n`
);

if (!result.valid) {
  process.exitCode = 1;
}
