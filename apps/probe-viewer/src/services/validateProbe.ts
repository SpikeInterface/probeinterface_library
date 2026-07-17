import Ajv from "ajv";
import type { ValidateFunction } from "ajv";

// The probeinterface JSON schema is downloaded into the app at build time by
// build.py, from the same upstream source tests.py validates this catalog
// against, so the viewer and CI agree on what "compliant" means.
const SCHEMA_URL = `${import.meta.env.BASE_URL}probe.schema.json`;

let validatorPromise: Promise<ValidateFunction> | null = null;

async function getValidator(): Promise<ValidateFunction> {
  if (!validatorPromise) {
    validatorPromise = (async () => {
      const response = await fetch(SCHEMA_URL);
      if (!response.ok) {
        throw new Error(`Failed to load probe schema (${response.status})`);
      }
      const schema = await response.json();
      // strict: false because the schema uses constructs ajv's strict mode
      // rejects (e.g. the union type in probe_planar_contour), which would throw
      // at compile time rather than produce a validation error.
      const ajv = new Ajv({ allErrors: true, strict: false });
      return ajv.compile(schema);
    })();
  }
  return validatorPromise;
}

export type ProbeValidation =
  | { valid: true }
  | { valid: false; errors: string[] };

// Validates parsed JSON against the probeinterface schema. Returns readable,
// path-annotated messages so the UI can tell the user exactly what makes a file
// non-compliant.
export async function validateProbeFile(
  data: unknown,
): Promise<ProbeValidation> {
  const validate = await getValidator();
  if (validate(data)) {
    return { valid: true };
  }
  const errors = (validate.errors ?? []).map((error) => {
    const location = error.instancePath || "(root)";
    return `${location} ${error.message ?? "is invalid"}`;
  });
  return { valid: false, errors };
}
