# 0003. YAML data, checked by JSON Schema

- Status: Accepted
- Date: 2026-09-27

## Context

The data (device models, spaces, wiring) lives as YAML files in the repo, where people can read and review it.

Keia's schemas are descriptive: they say which fields exist and roughly what they hold, and Keia's validator checks that the expected keys appear. That suits knowledge that people read. An app that draws ports and follows links from a space to its devices to their cables needs stricter checks: real types, allowed values, required fields and references that resolve.

Options considered:

1. Write Keia Atlas's extensions in Keia's descriptive format. Consistent with Keia and easy to contribute back, but it only catches missing keys.
2. Keep the data in YAML and write the rules in JSON Schema (draft 2020-12), also as YAML files. This is the pattern Kubernetes uses: YAML manifests checked against schemas built on JSON Schema rules.

## Decision

Option 2.

- Every data folder is listed in `schemas/registry.yaml` with the schema that checks it. A folder that isn't listed fails, so a typo can't skip the checks.
- The validator (`tools/validate.mjs`) uses [Ajv](https://ajv.js.org/json-schema.html) in strict mode and reports each problem with its file and line.
- Keia Atlas keeps strict JSON Schema copies of the five Keia content schemas it uses, in `schemas/keia/`, with a test that fails if a copy drifts from the pinned Keia version.

## Consequences

- Mistakes are caught before they reach the site, with messages that say where and what.
- The strict copies of Keia's schemas are extra files to keep in step with Keia; the drift test makes that visible rather than silent.
- Standard tooling: any JSON Schema validator or editor plugin can read the schemas.

Sources: [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12), [Kubernetes: CustomResourceDefinitions](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/), [YAML 1.2.2](https://yaml.org/spec/1.2.2/).
