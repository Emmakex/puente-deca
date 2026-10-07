import test from "node:test";
import assert from "node:assert/strict";
import { parseFinalAcceptanceArgs } from "../scripts/production/final-deca-acceptance.mjs";

const gates = Array.from(
  { length: 8 },
  (_, index) => `--gate-result=/secure/gate-${index + 1}.json`,
);

test("final acceptance requires exactly eight promoted gate results", () => {
  assert.throws(
    () => parseFinalAcceptanceArgs(gates.slice(0, 7)),
    (error) => error?.code === "FINAL_DECA_GATE_COUNT_INVALID",
  );
  assert.throws(
    () => parseFinalAcceptanceArgs([...gates, "--gate-result=/secure/extra.json"]),
    (error) => error?.code === "FINAL_DECA_GATE_COUNT_INVALID",
  );
});

test("final acceptance accepts exactly eight gates with a single output directory", () => {
  assert.deepEqual(
    parseFinalAcceptanceArgs([...gates, "--output-dir=/secure/final"]),
    {
      gateResultPaths: Array.from(
        { length: 8 },
        (_, index) => `/secure/gate-${index + 1}.json`,
      ),
      outputDir: "/secure/final",
    },
  );
});

test("final acceptance rejects bypass-like and unexpected controls", () => {
  for (const arg of ["--force", "--skip-checks", "--bypass", "--allow-pending"]) {
    assert.throws(
      () => parseFinalAcceptanceArgs([...gates, arg]),
      (error) => error?.code === "FINAL_DECA_ARGUMENT_INVALID",
    );
  }
});

test("final acceptance rejects duplicate or empty output directory arguments", () => {
  assert.throws(
    () =>
      parseFinalAcceptanceArgs([
        ...gates,
        "--output-dir=/secure/a",
        "--output-dir=/secure/b",
      ]),
    (error) => error?.code === "FINAL_DECA_OUTPUT_DIR_DUPLICATE",
  );

  assert.throws(
    () => parseFinalAcceptanceArgs([...gates, "--output-dir="]),
    (error) => error?.code === "FINAL_DECA_OUTPUT_DIR_INVALID",
  );
});

test("final acceptance rejects an empty gate path", () => {
  const args = [...gates];
  args[3] = "--gate-result=";
  assert.throws(
    () => parseFinalAcceptanceArgs(args),
    (error) => error?.code === "FINAL_DECA_GATE_PATH_INVALID",
  );
});
