# Parallel PySD Experiments via MCP: End‑State Architecture

## Executive Summary

Peragus will enable an AI agent to run many PySD system dynamics experiments in parallel, fully through MCP, with one notebook per experiment inside an isolated container. The agent will orchestrate containers, manage notebooks, stream events, and aggregate results—without leaving MCP.

This document defines the target end state, interfaces, and run-time lifecycle required to achieve this goal with minimal deviation from existing Srcbook/Peragus notebook and MCP designs.

## Goals

- Parallel execution of PySD experiments, each in its own container
- Pure MCP control plane: tools, resources, and events—no out‑of‑band APIs
- One notebook session per experiment (reproducible, exportable)
- Streamed telemetry (logs, metrics, outputs) with robust aggregation
- Deterministic, reproducible runs (immutable inputs, pinned environments)
- Elastic scaling up/down and safe teardown

## High‑Level Architecture

```
┌───────────────┐        ┌───────────────────┐        ┌──────────────────────────┐
│ Agent (LLM)   │ ─────▶ │ MCP Orchestrator  │ ─────▶ │ Container‑Use MCP Server │
│ (client)      │        │ (client library)  │        │ (host)                   │
└───────────────┘        └───────────────────┘        └─────────────┬────────────┘
                                                                     │
                                                     ┌───────────────┴───────────────┐
                                                     │ N Containers (ephemeral)      │
                                                     │ each runs:                    │
                                                     │  • Peragus Notebook MCP       │
                                                     │  • PySD runtime (Python)      │
                                                     │  • Experiment worker          │
                                                     └───────────────┬───────────────┘
                                                                     │
                                                     ┌───────────────┴───────────────┐
                                                     │ Results Store + Metadata DB   │
                                                     │ (object storage + catalog)    │
                                                     └───────────────────────────────┘
```

- Host exposes a container‑use MCP server to create/manage containers.
- Each container runs the Peragus notebook MCP server with PySD tooling enabled and creates one notebook session per experiment.
- The agent talks MCP only: first to the host server for lifecycle, then to each container’s notebook server (directly or via MCP proxy) for experiment control.

## Key Components

1) Container‑Use MCP Server (Host)
- Tools: `container_create`, `container_exec`, `container_cp_in`, `container_cp_out`, `container_logs`, `container_stats`, `container_destroy`, `container_list`, `container_health`
- Contracts: resource limits, CPU/memory constraints, network policy, image pinning

2) Notebook MCP Server (Inside Container)
- Reuse and extend existing notebook tools from `mcp-notebook-integration.md`
- Add PySD tools from `pysd-notebook-integration.md`
- One notebook session per experiment; session is source of truth for code, config, and outputs

3) MCP Proxy/Routing (Client‑side)
- Ability to register transient MCP endpoints for each container
- Route calls by `experiment_id` → container endpoint → notebook session

4) Results Layer
- Object storage for artifacts (CSV/Parquet/NetCDF, plots, `srcmd`, logs)
- Metadata catalog: experiment config, image digest, timestamps, checksums, lineage
- MCP resources to expose catalog entries and fetch artifacts

## End‑State Tooling (MCP)

### Host: Container Lifecycle
- `container_create`:
  - image: `ghcr.io/peragus/notebook-pysd:<digest>`
  - resources: { cpu: number, memory: string }
  - env: { … }
  - volumes: [ … ]
  - returns: `container_id`, `endpoint` (MCP URL of notebook server inside)
- `container_destroy`: idempotent teardown
- `container_stats`, `container_logs`, `container_health`
- `container_cp_in`/`container_cp_out`: move models/data/artifacts as needed

### In‑Container: Notebook + PySD
- Notebook Core (existing): `notebook_create`, `notebook_import`, `cell_add`, `cell_execute`, `notebook_export`, `notebook_delete`, resources + events
- PySD Extensions (per `pysd-notebook-integration.md`):
  - `pysd_model_load`
  - `pysd_experiment_run` (supports parameter sweep, Monte Carlo, LHS, optimization, scenarios)
  - `pysd_model_analyze`
  - `pysd_visualize`

### Aggregation and Catalog
- `experiment_register_result` (container → host or client → host): attach artifacts and metadata to `experiment_id`
- Resources:
  - `experiment://{id}/summary` (JSON)
  - `experiment://{id}/artifacts` (listing)
  - `experiment://{id}/metrics` (timeseries, KPIs)

## Execution Lifecycle (One Experiment)

1) Plan
- Agent selects model, experiment type, parameter grid, sample count, outputs, metrics

2) Provision
- Call `container_create` with pinned image and resource limits
- Receive `container_id` and `endpoint` for the notebook MCP server

3) Initialize Notebook
- Connect to `endpoint`
- `notebook_create` → session per experiment
- `pysd_model_load` (mdl/xmile/python)
- Optional: `notebook_import` with a template `srcmd` to seed cells

4) Execute
- `pysd_experiment_run` with config; stream events: `notebook.cell.output`, `notebook.cell.completed`, `notebook.error`
- Progress and metrics are emitted as events and written into the session

5) Persist
- `notebook_export` (`json`, `markdown`, `srcmd`) for full reproducibility
- Copy raw results via `container_cp_out` or publish via a notebook resource
- `experiment_register_result` to catalog artifacts/metrics

6) Teardown
- `container_destroy` on success or after retention policy

## Parallelism Model

- One container per experiment for strong isolation and predictable performance
- Scale to N containers based on quota; use a simple queue if submissions exceed capacity
- Inside a container, `pysd_experiment_run` may use multi‑core parallelism for large sweeps (opt‑in)
- Correlate everything with `experiment_id`, `container_id`, `session_id`

## Data and Reproducibility

- Pinned images (digest) and locked Python dependencies for PySD
- All inputs (models, data, experiment config) are checksummed and logged to the notebook session
- Exports include: `srcmd` notebook, raw output arrays/tables, plots, and run metadata

## Observability and Reliability

- Events: start/progress/complete/error per experiment; structured and streamable
- Health: `container_health` + watchdog for stalled runs, timeouts, memory pressure
- Retries: idempotent create/execute; safe resume where feasible
- Quotas/limits: per‑container CPU/memory caps; max runtime per job

## Security

- Network egress off by default in containers (enablelists if needed)
- Read‑only base image; write only to mounted work dir
- Namespaced volumes per experiment; no cross‑experiment visibility

## Example Orchestration (Agent Pseudocode)

```typescript
// 1) Plan a sweep of 24 experiments
targets = gridSearch(params)

for each target in targets parallel_limit K:
  const { container_id, endpoint } = await mcp.call('container_create', {
    image: 'ghcr.io/peragus/notebook-pysd@sha256:…',
    resources: { cpu: 2, memory: '4Gi' },
    env: { PYTHONHASHSEED: '0' }
  })

  const { session_id } = await mcp.to(endpoint).call('notebook_create', {
    name: `exp_${target.id}`
  })

  const model_id = await mcp.to(endpoint).call('pysd_model_load', {
    session_id, source: 'models/model.mdl', format: 'vensim', name: 'Model'
  })

  const result = await mcp.to(endpoint).call('pysd_experiment_run', {
    session_id, model_id, experiment: target.config, output_format: 'parquet'
  })

  await mcp.call('experiment_register_result', {
    experiment_id: target.id,
    container_id,
    session_id,
    artifacts: result.artifacts,
    metrics: result.metrics
  })

  await mcp.call('container_destroy', { container_id })
```

## Compatibility and Minimal Deviation

- Reuse existing notebook MCP contracts from `mcp-notebook-integration.md`
- Reuse PySD tool designs from `pysd-notebook-integration.md`
- Add only the container lifecycle tools and the result catalog resources required to glue both ends
- Preserve naming and interaction patterns to maximize familiarity

## Implementation Phases

1) Foundations
- Harden `container_create/*` tools and image with preinstalled PySD and notebook MCP server
- Add MCP proxy/routing in client to talk to container endpoints

2) PySD Tools in Notebook Server
- Implement `pysd_model_load`, `pysd_experiment_run`, `pysd_model_analyze`, `pysd_visualize`
- Wire events and resources for streaming results

3) Aggregation and Catalog
- Implement `experiment_register_result` and resources for summaries/artifacts/metrics
- Provide `srcmd` export default in every run for reproducibility

4) Scale and SRE
- Quotas, retries, timeouts, and autoscaling policies
- Dashboards for queue, success rate, runtime, and resource usage

## Success Criteria

- Start N parallel experiments with a single MCP plan; all complete within SLA
- Zero cross‑experiment interference; deterministic reruns from exported `srcmd`
- Full traceability: `experiment_id` → container → notebook session → artifacts/metrics
- No non‑MCP control path used by the agent


