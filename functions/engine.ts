
import { gql, interpolate, pickPath, withRetry } from "./_shared";

type StepType =
  | "llm_call"
  | "http_request"
  | "db_write"
  | "notify"
  | "conditional_branch"
  | "approval_gate";

type TriggerType =
  | "manual"
  | "webhook"
  | "scheduled"
  | "database_event";

type Step = {
  id: string;
  position: number;
  type: StepType;
  config: Record<string, any>;
};

type Workflow = {
  id: string;
  org_id: string;
  name: string;
  workflow_steps: Step[];
};

type Run = {
  id: string;
  status: string;
  workflow_id: string;
};

type StepRun = {
  id: string;
  workflow_step_id: string;
  status: string;
  attempt_count: number;
  output: any;
  input: any;
};

/* -------------------------------------------------------------------------- */
/* GraphQL queries                                                            */
/* -------------------------------------------------------------------------- */

const GET_WORKFLOW = `
  query ($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      org_id
      name

      workflow_steps(
        order_by: { position: asc }
      ) {
        id
        position
        type
        config
      }
    }
  }
`;

const GET_MEMBERS = `
  query ($org: uuid!, $user: uuid!) {
    org_members(
      where: {
        org_id: { _eq: $org }
        user_id: { _eq: $user }
      }
    ) {
      role
    }
  }
`;

const GET_ORG = `
  query ($id: uuid!) {
    organizations_by_pk(id: $id) {
      id
      quota_limit
      quota_used
    }
  }
`;

const INSERT_RUN = `
  mutation ($object: workflow_runs_insert_input!) {
    insert_workflow_runs_one(object: $object) {
      id
      status
      workflow_id
    }
  }
`;

const INSERT_STEP_RUNS = `
  mutation ($objects: [step_runs_insert_input!]!) {
    insert_step_runs(objects: $objects) {
      returning {
        id
        workflow_step_id
        status
        attempt_count
      }
    }
  }
`;

const UPDATE_RUN = `
  mutation (
    $id: uuid!
    $set: workflow_runs_set_input!
  ) {
    update_workflow_runs_by_pk(
      pk_columns: { id: $id }
      _set: $set
    ) {
      id
      status
    }
  }
`;

const UPDATE_STEP = `
  mutation (
    $id: uuid!
    $set: step_runs_set_input!
  ) {
    update_step_runs_by_pk(
      pk_columns: { id: $id }
      _set: $set
    ) {
      id
      status
      attempt_count
    }
  }
`;

const STEP_RUN_LOOKUP = `
  query (
    $run: uuid!
    $step: uuid!
  ) {
    step_runs(
      where: {
        workflow_run_id: { _eq: $run }
        workflow_step_id: { _eq: $step }
      }
      limit: 1
    ) {
      id
      status
      attempt_count
      input
      output
    }
  }
`;

const INCREMENT_QUOTA = `
  mutation ($id: uuid!) {
    update_organizations_by_pk(
      pk_columns: { id: $id }
      _inc: {
        quota_used: 1
      }
    ) {
      id
      quota_used
    }
  }
`;

const GET_STEP_RUN = `
  query ($id: uuid!) {
    step_runs_by_pk(id: $id) {
      id
      status
      workflow_run_id
      workflow_step_id
      output
    }
  }
`;

const GET_RUN = `
  query ($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      id
      status
      workflow_id
    }
  }
`;

/* -------------------------------------------------------------------------- */
/* Authorization                                                              */
/* -------------------------------------------------------------------------- */

export async function authorizeWorkflow(
  workflowId: string,
  userId: string
) {
  const result = await gql<{
    workflows_by_pk: Workflow | null;
  }>(GET_WORKFLOW, {
    id: workflowId,
  });

  const workflow = result.workflows_by_pk;

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const members = await gql<{
    org_members: Array<{
      role: string;
    }>;
  }>(GET_MEMBERS, {
    org: workflow.org_id,
    user: userId,
  });

  const role = members.org_members[0]?.role;

  if (role !== "owner" && role !== "editor") {
    throw new Error(
      "You must be an owner or editor of this organization"
    );
  }

  return {
    workflow,
    role,
  };
}

/* -------------------------------------------------------------------------- */
/* Quota                                                                      */
/* -------------------------------------------------------------------------- */

async function checkQuota(orgId: string) {
  const result = await gql<{
    organizations_by_pk: {
      id: string;
      quota_limit: number;
      quota_used: number;
    } | null;
  }>(GET_ORG, {
    id: orgId,
  });

  const organization = result.organizations_by_pk;

  if (!organization) {
    throw new Error("Organization not found");
  }

  if (organization.quota_used >= organization.quota_limit) {
    throw new Error("Organization quota exhausted");
  }

  return organization;
}

/* -------------------------------------------------------------------------- */
/* Utility functions                                                          */
/* -------------------------------------------------------------------------- */

function outputText(value: any): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value ?? "");
}

function conditionMatches(
  actual: any,
  operator: string,
  expected: any
): boolean {
  const text = outputText(actual);

  switch (operator) {
    case "contains":
      return text
        .toLowerCase()
        .includes(String(expected).toLowerCase());

    case "equals":
      return text === String(expected);

    case "not_contains":
      return !text
        .toLowerCase()
        .includes(String(expected).toLowerCase());

    case "exists":
      return actual !== undefined && actual !== null;

    case "truthy":
      return Boolean(actual);

    default:
      throw new Error(
        `Unsupported conditional operator: ${operator}`
      );
  }
}

/* -------------------------------------------------------------------------- */
/* LLM step                                                                   */
/* -------------------------------------------------------------------------- */

async function llm(
  config: Record<string, any>,
  context: any
) {
  const baseUrl =
    process.env.LLM_BASE_URL ||
    "https://api.groq.com/openai/v1";

  const apiKey = process.env.LLM_API_KEY;

  const model =
    config.model ||
    process.env.LLM_MODEL ||
    "llama-3.1-8b-instant";

  const prompt = interpolate(
    String(
      config.prompt ||
        "Respond to the input."
    ),
    context
  );

  /*
   * Assignment fallback:
   * If no API key exists, use an artificial delay and
   * return a clearly disclosed stub response.
   */
  if (!apiKey) {
    await new Promise((resolve) =>
      setTimeout(resolve, 700)
    );

    return {
      stub: true,
      text: `Stubbed LLM response for: ${prompt}`,
    };
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: config.temperature ?? 0.2,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `LLM HTTP ${response.status}: ${body}`
    );
  }

  const json = (await response.json()) as any;

  return {
    text:
      json.choices?.[0]?.message?.content ?? "",
    model,
  };
}

/* -------------------------------------------------------------------------- */
/* HTTP request step                                                          */
/* -------------------------------------------------------------------------- */

async function httpRequest(
  config: Record<string, any>,
  context: any
) {
  const url = interpolate(
    String(
      config.url ||
        "https://httpbin.org/get"
    ),
    context
  );

  const method = String(
    config.method || "GET"
  ).toUpperCase();

  const headers = {
    "Content-Type": "application/json",
    ...(config.headers || {}),
  };

  const requestInit: RequestInit = {
    method,
    headers,
  };

  if (
    method !== "GET" &&
    method !== "HEAD"
  ) {
    requestInit.body = JSON.stringify(
      config.body ??
        context.previousOutput ??
        {}
    );
  }

  const response = await fetch(
    url,
    requestInit
  );

  const text = await response.text();

  let body: any;

  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${text.slice(
        0,
        500
      )}`
    );
  }

  return {
    status: response.status,
    body,
  };
}

/* -------------------------------------------------------------------------- */
/* Step execution                                                             */
/* -------------------------------------------------------------------------- */

async function runStep(
  step: Step,
  context: any
) {
  switch (step.type) {
    case "llm_call":
      return llm(
        step.config,
        context
      );

    case "http_request":
      return httpRequest(
        step.config,
        context
      );

    case "conditional_branch": {
      const actual = pickPath(
        context.previousOutput,
        step.config.field
      );

      const matched = conditionMatches(
        actual,
        String(
          step.config.operator ||
            "contains"
        ),
        step.config.value
      );

      return {
        matched,
        branch: matched
          ? "then"
          : "else",
        value: actual,
      };
    }

    case "approval_gate":
      return {
        paused: true,
        message:
          step.config.message ||
          "Approval required",
      };

    /*
     * NOTE:
     * This is currently only an execution
     * placeholder. It does NOT actually write
     * to a database table.
     */
    case "db_write":
      return {
        persisted: true,
        table:
          step.config.table ||
          "step_runs",
        note:
          "Database write implementation required",
        value:
          context.previousOutput,
      };

    /*
     * NOTE:
     * This currently returns an event-like
     * object. It is NOT itself a Hasura Event
     * Trigger.
     */
    case "notify":
      return {
        event_trigger: true,
        message: interpolate(
          String(
            step.config.message ||
              "Workflow notification"
          ),
          context
        ),
      };

    default:
      throw new Error(
        `Unsupported step type: ${step.type}`
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Step run lookup                                                            */
/* -------------------------------------------------------------------------- */

async function lookupStepRun(
  runId: string,
  stepId: string
) {
  const result = await gql<{
    step_runs: StepRun[];
  }>(
    STEP_RUN_LOOKUP,
    {
      run: runId,
      step: stepId,
    }
  );

  const stepRun = result.step_runs[0];

  if (!stepRun) {
    throw new Error(
      `Missing step run for ${stepId}`
    );
  }

  return stepRun;
}

/* -------------------------------------------------------------------------- */
/* Workflow execution                                                         */
/* -------------------------------------------------------------------------- */

export async function startWorkflow(
  workflow: Workflow,
  runId: string,
  triggerType: TriggerType,
  inputData: any = {},
  options?: {
    skipRunInitialization?: boolean;
    previousOutput?: any;
    quotaAlreadyCounted?: boolean;
  }
) {
  if (!options?.skipRunInitialization) {
    await gql(UPDATE_RUN, {
      id: runId,

      set: {
        status: "running",
        started_at:
          new Date().toISOString(),
      },
    });
  }

  let previousOutput =
    options?.previousOutput ??
    inputData;

  const skipPositions =
    new Set<number>();

  for (const step of workflow.workflow_steps) {
    /*
     * Conditional branches can mark positions
     * that should be skipped.
     */
    if (
      skipPositions.has(step.position)
    ) {
      const skippedStepRun =
        await lookupStepRun(
          runId,
          step.id
        );

      await gql(UPDATE_STEP, {
        id: skippedStepRun.id,

        set: {
          status: "completed",

          input: {
            skipped: true,
          },

          output: {
            skipped: true,
          },

          completed_at:
            new Date().toISOString(),
        },
      });

      continue;
    }

    const stepRun =
      await lookupStepRun(
        runId,
        step.id
      );

    const context = {
      input: inputData,

      previousOutput,

      workflow: {
        id: workflow.id,
        name: workflow.name,
      },

      workflow_run_id: runId,

      trigger_type: triggerType,
    };

    await gql(UPDATE_STEP, {
      id: stepRun.id,

      set: {
        status: "running",

        started_at:
          new Date().toISOString(),

        attempt_count: 1,

        input: context,
      },
    });

    try {
      /*
       * withRetry(..., 2) means the step gets
       * retried after an initial failure.
       */
      const output = await withRetry(
        () =>
          runStep(
            step,
            context
          ),
        2
      );

      previousOutput = output;

      /*
       * Conditional branch.
       */
      if (
        step.type === "conditional_branch" &&
        "branch" in output
      ) {
        const positions =
          output.branch === "then"
            ? step.config.then_positions || []
            : step.config.else_positions || [];

        for (const position of positions) {
          skipPositions.add(
            Number(position)
          );
        }
      }

      /*
       * Approval gate.
       */
      if (
        step.type ===
        "approval_gate"
      ) {
        await gql(UPDATE_STEP, {
          id: stepRun.id,

          set: {
            status: "paused",
            output,
          },
        });

        await gql(UPDATE_RUN, {
          id: runId,

          set: {
            status: "paused",
          },
        });

        return {
          status: "paused" as const,
          pausedStepRunId:
            stepRun.id,
          previousOutput,
        };
      }

      await gql(UPDATE_STEP, {
        id: stepRun.id,

        set: {
          status: "completed",
          output,

          completed_at:
            new Date().toISOString(),
        },
      });
    } catch (error: any) {
      const message =
        error?.message ||
        String(error);

      await gql(UPDATE_STEP, {
        id: stepRun.id,

        set: {
          status: "failed",
          error: message,

          completed_at:
            new Date().toISOString(),
        },
      });

      await gql(UPDATE_RUN, {
        id: runId,

        set: {
          status: "failed",
          error: message,

          completed_at:
            new Date().toISOString(),
        },
      });

      return {
        status: "failed" as const,
        error: message,
      };
    }
  }

  await gql(UPDATE_RUN, {
    id: runId,

    set: {
      status: "completed",

      completed_at:
        new Date().toISOString(),
    },
  });

  /*
   * Quota is counted only once, when the
   * complete workflow finishes.
   */
  if (!options?.quotaAlreadyCounted) {
    await gql(INCREMENT_QUOTA, {
      id: workflow.org_id,
    });
  }

  return {
    status: "completed" as const,
  };
}

/* -------------------------------------------------------------------------- */
/* Create run                                                                 */
/* -------------------------------------------------------------------------- */

export async function createRun(
  workflow: Workflow,
  triggerType: TriggerType,
  inputData: any = {}
) {
  await checkQuota(
    workflow.org_id
  );

  const result = await gql<{
    insert_workflow_runs_one: Run;
  }>(
    INSERT_RUN,
    {
      object: {
        workflow_id:
          workflow.id,

        status: "pending",

        trigger_type:
          triggerType,
      },
    }
  );

  const runId =
    result.insert_workflow_runs_one.id;

  const stepRunObjects =
    workflow.workflow_steps.map(
      (step) => ({
        workflow_run_id: runId,

        workflow_step_id:
          step.id,

        status: "pending",

        attempt_count: 0,
      })
    );

  if (stepRunObjects.length > 0) {
    await gql(
      INSERT_STEP_RUNS,
      {
        objects:
          stepRunObjects,
      }
    );
  }

  const execution =
    await startWorkflow(
      workflow,
      runId,
      triggerType,
      inputData
    );

  return {
    runId,
    result: execution,
  };
}

/* -------------------------------------------------------------------------- */
/* Resume paused workflow                                                     */
/* -------------------------------------------------------------------------- */

export async function resumeWorkflow(
  approvedStepRunId: string,
  userId: string
) {
  /*
   * 1. Get the approval-gate step run.
   */
  const stepResult = await gql<{
    step_runs_by_pk: {
      id: string;
      status: string;
      workflow_run_id: string;
      workflow_step_id: string;
      output: any;
    } | null;
  }>(
    GET_STEP_RUN,
    {
      id: approvedStepRunId,
    }
  );

  const stepRun =
    stepResult.step_runs_by_pk;

  if (!stepRun) {
    throw new Error(
      "Step run not found"
    );
  }

  /*
   * 2. Get the workflow run.
   */
  const runResult = await gql<{
    workflow_runs_by_pk: {
      id: string;
      status: string;
      workflow_id: string;
    } | null;
  }>(
    GET_RUN,
    {
      id: stepRun.workflow_run_id,
    }
  );

  const run =
    runResult.workflow_runs_by_pk;

  if (!run) {
    throw new Error(
      "Workflow run not found"
    );
  }

  if (run.status !== "paused") {
    throw new Error(
      "Run is not paused"
    );
  }

  /*
   * 3. Load the workflow.
   */
  const workflowResult =
    await gql<{
      workflows_by_pk:
        | Workflow
        | null;
    }>(
      GET_WORKFLOW,
      {
        id: run.workflow_id,
      }
    );

  const workflow =
    workflowResult.workflows_by_pk;

  if (!workflow) {
    throw new Error(
      "Workflow not found"
    );
  }

  /*
   * 4. SECURITY LAYER 2:
   *
   * The approver must be an owner/editor
   * of THIS workflow's organization.
   */
  const members = await gql<{
    org_members: Array<{
      role: string;
    }>;
  }>(
    GET_MEMBERS,
    {
      org: workflow.org_id,
      user: userId,
    }
  );

  const role =
    members.org_members[0]?.role;

  if (
    role !== "owner" &&
    role !== "editor"
  ) {
    throw new Error(
      "Only an owner/editor can approve"
    );
  }

  /*
   * 5. Make sure this really is the
   * paused step.
   */
  if (stepRun.status !== "paused") {
    throw new Error(
      "Step run is not awaiting approval"
    );
  }

  /*
   * 6. Mark the approval gate completed.
   */
  await gql(UPDATE_STEP, {
    id: approvedStepRunId,

    set: {
      status: "completed",

      approved_by: userId,

      approved_at:
        new Date().toISOString(),

      completed_at:
        new Date().toISOString(),

      output: {
        approved: true,
        approved_by: userId,
      },
    },
  });

  /*
   * 7. Find the approval gate in the
   * original workflow.
   */
  const approvalIndex =
    workflow.workflow_steps.findIndex(
      (step) =>
        step.id ===
        stepRun.workflow_step_id
    );

  if (approvalIndex === -1) {
    throw new Error(
      "Approval step does not belong to workflow"
    );
  }

  /*
   * 8. Continue with steps after
   * the approval gate.
   */
  const remainingSteps =
    workflow.workflow_steps.slice(
      approvalIndex + 1
    );

  /*
   * The approval gate's output becomes
   * the previous output for the next step.
   */
  const resumedWorkflow: Workflow = {
    ...workflow,

    workflow_steps:
      remainingSteps,
  };

  /*
   * 9. Resume execution without
   * recreating the workflow run.
   *
   * IMPORTANT:
   * quota is counted only when the
   * resumed workflow eventually completes.
   */
  return startWorkflow(
    resumedWorkflow,
    run.id,
    "manual",
    {
      resumed_from:
        approvedStepRunId,
    },
    {
      skipRunInitialization: false,

      previousOutput: {
        approved: true,
        approved_by: userId,
      },

      quotaAlreadyCounted: false,
    }
  );
}

















// import { gql, interpolate, pickPath, withRetry } from "./_shared";

// type StepType =
//   | "llm_call"
//   | "http_request"
//   | "db_write"
//   | "notify"
//   | "conditional_branch"
//   | "approval_gate";

// type TriggerType =
//   | "manual"
//   | "webhook"
//   | "scheduled"
//   | "database_event";

// type Step = {
//   id: string;
//   position: number;
//   type: StepType;
//   config: Record<string, any>;
// };

// type Workflow = {
//   id: string;
//   org_id: string;
//   name: string;
//   workflow_steps: Step[];
// };

// type Run = {
//   id: string;
//   status: string;
//   workflow_id: string;
// };

// type StepRun = {
//   id: string;
//   workflow_step_id: string;
//   status: string;
//   attempt_count: number;
//   output: any;
//   input: any;
// };

// /* -------------------------------------------------------------------------- */
// /* GraphQL queries                                                            */
// /* -------------------------------------------------------------------------- */

// const GET_WORKFLOW = `
//   query ($id: uuid!) {
//     workflows_by_pk(id: $id) {
//       id
//       org_id
//       name

//       workflow_steps(
//         order_by: { position: asc }
//       ) {
//         id
//         position
//         type
//         config
//       }
//     }
//   }
// `;

// const GET_MEMBERS = `
//   query ($org: uuid!, $user: uuid!) {
//     org_members(
//       where: {
//         org_id: { _eq: $org }
//         user_id: { _eq: $user }
//       }
//     ) {
//       role
//     }
//   }
// `;

// const GET_ORG = `
//   query ($id: uuid!) {
//     organizations_by_pk(id: $id) {
//       id
//       quota_limit
//       quota_used
//     }
//   }
// `;

// const INSERT_RUN = `
//   mutation ($object: workflow_runs_insert_input!) {
//     insert_workflow_runs_one(object: $object) {
//       id
//       status
//       workflow_id
//     }
//   }
// `;

// const INSERT_STEP_RUNS = `
//   mutation ($objects: [step_runs_insert_input!]!) {
//     insert_step_runs(objects: $objects) {
//       returning {
//         id
//         workflow_step_id
//         status
//         attempt_count
//       }
//     }
//   }
// `;

// const UPDATE_RUN = `
//   mutation (
//     $id: uuid!
//     $set: workflow_runs_set_input!
//   ) {
//     update_workflow_runs_by_pk(
//       pk_columns: { id: $id }
//       _set: $set
//     ) {
//       id
//       status
//     }
//   }
// `;

// const UPDATE_STEP = `
//   mutation (
//     $id: uuid!
//     $set: step_runs_set_input!
//   ) {
//     update_step_runs_by_pk(
//       pk_columns: { id: $id }
//       _set: $set
//     ) {
//       id
//       status
//       attempt_count
//     }
//   }
// `;

// const STEP_RUN_LOOKUP = `
//   query (
//     $run: uuid!
//     $step: uuid!
//   ) {
//     step_runs(
//       where: {
//         workflow_run_id: { _eq: $run }
//         workflow_step_id: { _eq: $step }
//       }
//       limit: 1
//     ) {
//       id
//       status
//       attempt_count
//       input
//       output
//     }
//   }
// `;

// const INCREMENT_QUOTA = `
//   mutation ($id: uuid!) {
//     update_organizations_by_pk(
//       pk_columns: { id: $id }
//       _inc: {
//         quota_used: 1
//       }
//     ) {
//       id
//       quota_used
//     }
//   }
// `;

// const GET_STEP_RUN = `
//   query ($id: uuid!) {
//     step_runs_by_pk(id: $id) {
//       id
//       status
//       workflow_run_id
//       workflow_step_id
//       output
//     }
//   }
// `;

// const GET_RUN = `
//   query ($id: uuid!) {
//     workflow_runs_by_pk(id: $id) {
//       id
//       status
//       workflow_id
//     }
//   }
// `;

// /* -------------------------------------------------------------------------- */
// /* Authorization                                                             */
// /* -------------------------------------------------------------------------- */

// export async function authorizeWorkflow(
//   workflowId: string,
//   userId: string
// ) {
//   const result = await gql<{
//     workflows_by_pk: Workflow | null;
//   }>(GET_WORKFLOW, {
//     id: workflowId,
//   });

//   const workflow = result.workflows_by_pk;

//   if (!workflow) {
//     throw new Error("Workflow not found");
//   }

//   const members = await gql<{
//     org_members: Array<{
//       role: string;
//     }>;
//   }>(GET_MEMBERS, {
//     org: workflow.org_id,
//     user: userId,
//   });

//   const role = members.org_members[0]?.role;

//   if (role !== "owner" && role !== "editor") {
//     throw new Error(
//       "You must be an owner or editor of this organization"
//     );
//   }

//   return {
//     workflow,
//     role,
//   };
// }

// /* -------------------------------------------------------------------------- */
// /* Quota                                                                     */
// /* -------------------------------------------------------------------------- */

// async function checkQuota(orgId: string) {
//   const result = await gql<{
//     organizations_by_pk: {
//       id: string;
//       quota_limit: number;
//       quota_used: number;
//     } | null;
//   }>(GET_ORG, {
//     id: orgId,
//   });

//   const organization = result.organizations_by_pk;

//   if (!organization) {
//     throw new Error("Organization not found");
//   }

//   if (organization.quota_used >= organization.quota_limit) {
//     throw new Error("Organization quota exhausted");
//   }

//   return organization;
// }

// /* -------------------------------------------------------------------------- */
// /* Utility functions                                                         */
// /* -------------------------------------------------------------------------- */

// function outputText(value: any): string {
//   if (typeof value === "string") {
//     return value;
//   }

//   return JSON.stringify(value ?? "");
// }

// function conditionMatches(
//   actual: any,
//   operator: string,
//   expected: any
// ): boolean {
//   const text = outputText(actual);

//   switch (operator) {
//     case "contains":
//       return text
//         .toLowerCase()
//         .includes(String(expected).toLowerCase());

//     case "equals":
//       return text === String(expected);

//     case "not_contains":
//       return !text
//         .toLowerCase()
//         .includes(String(expected).toLowerCase());

//     case "exists":
//       return actual !== undefined && actual !== null;

//     case "truthy":
//       return Boolean(actual);

//     default:
//       throw new Error(
//         `Unsupported conditional operator: ${operator}`
//       );
//   }
// }

// /* -------------------------------------------------------------------------- */
// /* LLM step                                                                  */
// /* -------------------------------------------------------------------------- */

// async function llm(
//   config: Record<string, any>,
//   context: any
// ) {
//   const baseUrl =
//     process.env.LLM_BASE_URL ||
//     "https://api.groq.com/openai/v1";

//   const apiKey = process.env.LLM_API_KEY;

//   const model =
//     config.model ||
//     process.env.LLM_MODEL ||
//     "llama-3.1-8b-instant";

//   const prompt = interpolate(
//     String(
//       config.prompt ||
//         "Respond to the input."
//     ),
//     context
//   );

//   /*
//    * Assignment fallback:
//    * If no API key exists, use an artificial delay and
//    * return a clearly disclosed stub response.
//    */
//   if (!apiKey) {
//     await new Promise((resolve) =>
//       setTimeout(resolve, 700)
//     );

//     return {
//       stub: true,
//       text: `Stubbed LLM response for: ${prompt}`,
//     };
//   }

//   const response = await fetch(
//     `${baseUrl.replace(/\/$/, "")}/chat/completions`,
//     {
//       method: "POST",

//       headers: {
//         Authorization: `Bearer ${apiKey}`,
//         "Content-Type": "application/json",
//       },

//       body: JSON.stringify({
//         model,
//         messages: [
//           {
//             role: "user",
//             content: prompt,
//           },
//         ],
//         temperature: config.temperature ?? 0.2,
//       }),
//     }
//   );

//   if (!response.ok) {
//     const body = await response.text();

//     throw new Error(
//       `LLM HTTP ${response.status}: ${body}`
//     );
//   }

//   const json = (await response.json()) as any;

//   return {
//     text:
//       json.choices?.[0]?.message?.content ?? "",
//     model,
//   };
// }

// /* -------------------------------------------------------------------------- */
// /* HTTP request step                                                         */
// /* -------------------------------------------------------------------------- */

// async function httpRequest(
//   config: Record<string, any>,
//   context: any
// ) {
//   const url = interpolate(
//     String(
//       config.url ||
//         "https://httpbin.org/get"
//     ),
//     context
//   );

//   const method = String(
//     config.method || "GET"
//   ).toUpperCase();

//   const headers = {
//     "Content-Type": "application/json",
//     ...(config.headers || {}),
//   };

//   const requestInit: RequestInit = {
//     method,
//     headers,
//   };

//   if (
//     method !== "GET" &&
//     method !== "HEAD"
//   ) {
//     requestInit.body = JSON.stringify(
//       config.body ??
//         context.previousOutput ??
//         {}
//     );
//   }

//   const response = await fetch(
//     url,
//     requestInit
//   );

//   const text = await response.text();

//   let body: any;

//   try {
//     body = JSON.parse(text);
//   } catch {
//     body = text;
//   }

//   if (!response.ok) {
//     throw new Error(
//       `HTTP ${response.status}: ${text.slice(
//         0,
//         500
//       )}`
//     );
//   }

//   return {
//     status: response.status,
//     body,
//   };
// }

// /* -------------------------------------------------------------------------- */
// /* Step execution                                                            */
// /* -------------------------------------------------------------------------- */

// async function runStep(
//   step: Step,
//   context: any
// ) {
//   switch (step.type) {
//     case "llm_call":
//       return llm(
//         step.config,
//         context
//       );

//     case "http_request":
//       return httpRequest(
//         step.config,
//         context
//       );

//     case "conditional_branch": {
//       const actual = pickPath(
//         context.previousOutput,
//         step.config.field
//       );

//       const matched = conditionMatches(
//         actual,
//         String(
//           step.config.operator ||
//             "contains"
//         ),
//         step.config.value
//       );

//       return {
//         matched,
//         branch: matched
//           ? "then"
//           : "else",
//         value: actual,
//       };
//     }

//     case "approval_gate":
//       return {
//         paused: true,
//         message:
//           step.config.message ||
//           "Approval required",
//       };

//     /*
//      * NOTE:
//      * This is currently only an execution
//      * placeholder. It does NOT actually write
//      * to a database table.
//      */
//     case "db_write":
//       return {
//         persisted: true,
//         table:
//           step.config.table ||
//           "step_runs",
//         note:
//           "Database write implementation required",
//         value:
//           context.previousOutput,
//       };

//     /*
//      * NOTE:
//      * This currently returns an event-like
//      * object. It is NOT itself a Hasura Event
//      * Trigger.
//      */
//     case "notify":
//       return {
//         event_trigger: true,
//         message: interpolate(
//           String(
//             step.config.message ||
//               "Workflow notification"
//           ),
//           context
//         ),
//       };

//     default:
//       throw new Error(
//         `Unsupported step type: ${step.type}`
//       );
//   }
// }

// /* -------------------------------------------------------------------------- */
// /* Step run lookup                                                           */
// /* -------------------------------------------------------------------------- */

// async function lookupStepRun(
//   runId: string,
//   stepId: string
// ) {
//   const result = await gql<{
//     step_runs: StepRun[];
//   }>(
//     STEP_RUN_LOOKUP,
//     {
//       run: runId,
//       step: stepId,
//     }
//   );

//   const stepRun = result.step_runs[0];

//   if (!stepRun) {
//     throw new Error(
//       `Missing step run for ${stepId}`
//     );
//   }

//   return stepRun;
// }

// /* -------------------------------------------------------------------------- */
// /* Workflow execution                                                        */
// /* -------------------------------------------------------------------------- */

// export async function startWorkflow(
//   workflow: Workflow,
//   runId: string,
//   triggerType: TriggerType,
//   inputData: any = {},
//   options?: {
//     skipRunInitialization?: boolean;
//     previousOutput?: any;
//     quotaAlreadyCounted?: boolean;
//   }
// ) {
//   if (!options?.skipRunInitialization) {
//     await gql(UPDATE_RUN, {
//       id: runId,

//       set: {
//         status: "running",
//         started_at:
//           new Date().toISOString(),
//       },
//     });
//   }

//   let previousOutput =
//     options?.previousOutput ??
//     inputData;

//   const skipPositions =
//     new Set<number>();

//   for (const step of workflow.workflow_steps) {
//     /*
//      * Conditional branches can mark positions
//      * that should be skipped.
//      */
//     if (
//       skipPositions.has(step.position)
//     ) {
//       const skippedStepRun =
//         await lookupStepRun(
//           runId,
//           step.id
//         );

//       await gql(UPDATE_STEP, {
//         id: skippedStepRun.id,

//         set: {
//           status: "completed",

//           input: {
//             skipped: true,
//           },

//           output: {
//             skipped: true,
//           },

//           completed_at:
//             new Date().toISOString(),
//         },
//       });

//       continue;
//     }

//     const stepRun =
//       await lookupStepRun(
//         runId,
//         step.id
//       );

//     const context = {
//       input: inputData,

//       previousOutput,

//       workflow: {
//         id: workflow.id,
//         name: workflow.name,
//       },

//       workflow_run_id: runId,

//       trigger_type: triggerType,
//     };

//     await gql(UPDATE_STEP, {
//       id: stepRun.id,

//       set: {
//         status: "running",

//         started_at:
//           new Date().toISOString(),

//         attempt_count: 1,

//         input: context,
//       },
//     });

//     try {
//       /*
//        * withRetry(..., 2) means the step gets
//        * retried after an initial failure.
//        */
//       const output = await withRetry(
//         () =>
//           runStep(
//             step,
//             context
//           ),
//         2
//       );

//       previousOutput = output;

//       /*
//        * Conditional branch.
//        */
//       if (
//         step.type ===
//         "conditional_branch"
//       ) {
//         const positions =
//           output.branch === "then"
//             ? step.config
//                 .then_positions || []
//             : step.config
//                 .else_positions || [];

//         for (const position of positions) {
//           skipPositions.add(
//             Number(position)
//           );
//         }
//       }

//       /*
//        * Approval gate.
//        */
//       if (
//         step.type ===
//         "approval_gate"
//       ) {
//         await gql(UPDATE_STEP, {
//           id: stepRun.id,

//           set: {
//             status: "paused",
//             output,
//           },
//         });

//         await gql(UPDATE_RUN, {
//           id: runId,

//           set: {
//             status: "paused",
//           },
//         });

//         return {
//           status: "paused" as const,
//           pausedStepRunId:
//             stepRun.id,
//           previousOutput,
//         };
//       }

//       await gql(UPDATE_STEP, {
//         id: stepRun.id,

//         set: {
//           status: "completed",
//           output,

//           completed_at:
//             new Date().toISOString(),
//         },
//       });
//     } catch (error: any) {
//       const message =
//         error?.message ||
//         String(error);

//       await gql(UPDATE_STEP, {
//         id: stepRun.id,

//         set: {
//           status: "failed",
//           error: message,

//           completed_at:
//             new Date().toISOString(),
//         },
//       });

//       await gql(UPDATE_RUN, {
//         id: runId,

//         set: {
//           status: "failed",
//           error: message,

//           completed_at:
//             new Date().toISOString(),
//         },
//       });

//       return {
//         status: "failed" as const,
//         error: message,
//       };
//     }
//   }

//   await gql(UPDATE_RUN, {
//     id: runId,

//     set: {
//       status: "completed",

//       completed_at:
//         new Date().toISOString(),
//     },
//   });

//   /*
//    * Quota is counted only once, when the
//    * complete workflow finishes.
//    */
//   if (!options?.quotaAlreadyCounted) {
//     await gql(INCREMENT_QUOTA, {
//       id: workflow.org_id,
//     });
//   }

//   return {
//     status: "completed" as const,
//   };
// }

// /* -------------------------------------------------------------------------- */
// /* Create run                                                                */
// /* -------------------------------------------------------------------------- */

// export async function createRun(
//   workflow: Workflow,
//   triggerType: TriggerType,
//   inputData: any = {}
// ) {
//   await checkQuota(
//     workflow.org_id
//   );

//   const result = await gql<{
//     insert_workflow_runs_one: Run;
//   }>(
//     INSERT_RUN,
//     {
//       object: {
//         workflow_id:
//           workflow.id,

//         status: "pending",

//         trigger_type:
//           triggerType,
//       },
//     }
//   );

//   const runId =
//     result.insert_workflow_runs_one.id;

//   const stepRunObjects =
//     workflow.workflow_steps.map(
//       (step) => ({
//         workflow_run_id: runId,

//         workflow_step_id:
//           step.id,

//         status: "pending",

//         attempt_count: 0,
//       })
//     );

//   if (stepRunObjects.length > 0) {
//     await gql(
//       INSERT_STEP_RUNS,
//       {
//         objects:
//           stepRunObjects,
//       }
//     );
//   }

//   const execution =
//     await startWorkflow(
//       workflow,
//       runId,
//       triggerType,
//       inputData
//     );

//   return {
//     runId,
//     result: execution,
//   };
// }

// /* -------------------------------------------------------------------------- */
// /* Resume paused workflow                                                    */
// /* -------------------------------------------------------------------------- */

// export async function resumeWorkflow(
//   approvedStepRunId: string,
//   userId: string
// ) {
//   /*
//    * 1. Get the approval-gate step run.
//    */
//   const stepResult = await gql<{
//     step_runs_by_pk: {
//       id: string;
//       status: string;
//       workflow_run_id: string;
//       workflow_step_id: string;
//       output: any;
//     } | null;
//   }>(
//     GET_STEP_RUN,
//     {
//       id: approvedStepRunId,
//     }
//   );

//   const stepRun =
//     stepResult.step_runs_by_pk;

//   if (!stepRun) {
//     throw new Error(
//       "Step run not found"
//     );
//   }

//   /*
//    * 2. Get the workflow run.
//    */
//   const runResult = await gql<{
//     workflow_runs_by_pk: {
//       id: string;
//       status: string;
//       workflow_id: string;
//     } | null;
//   }>(
//     GET_RUN,
//     {
//       id: stepRun.workflow_run_id,
//     }
//   );

//   const run =
//     runResult.workflow_runs_by_pk;

//   if (!run) {
//     throw new Error(
//       "Workflow run not found"
//     );
//   }

//   if (run.status !== "paused") {
//     throw new Error(
//       "Run is not paused"
//     );
//   }

//   /*
//    * 3. Load the workflow.
//    */
//   const workflowResult =
//     await gql<{
//       workflows_by_pk:
//         | Workflow
//         | null;
//     }>(
//       GET_WORKFLOW,
//       {
//         id: run.workflow_id,
//       }
//     );

//   const workflow =
//     workflowResult.workflows_by_pk;

//   if (!workflow) {
//     throw new Error(
//       "Workflow not found"
//     );
//   }

//   /*
//    * 4. SECURITY LAYER 2:
//    *
//    * The approver must be an owner/editor
//    * of THIS workflow's organization.
//    */
//   const members = await gql<{
//     org_members: Array<{
//       role: string;
//     }>;
//   }>(
//     GET_MEMBERS,
//     {
//       org: workflow.org_id,
//       user: userId,
//     }
//   );

//   const role =
//     members.org_members[0]?.role;

//   if (
//     role !== "owner" &&
//     role !== "editor"
//   ) {
//     throw new Error(
//       "Only an owner/editor can approve"
//     );
//   }

//   /*
//    * 5. Make sure this really is the
//    * paused step.
//    */
//   if (stepRun.status !== "paused") {
//     throw new Error(
//       "Step run is not awaiting approval"
//     );
//   }

//   /*
//    * 6. Mark the approval gate completed.
//    */
//   await gql(UPDATE_STEP, {
//     id: approvedStepRunId,

//     set: {
//       status: "completed",

//       approved_by: userId,

//       approved_at:
//         new Date().toISOString(),

//       completed_at:
//         new Date().toISOString(),

//       output: {
//         approved: true,
//         approved_by: userId,
//       },
//     },
//   });

//   /*
//    * 7. Find the approval gate in the
//    * original workflow.
//    */
//   const approvalIndex =
//     workflow.workflow_steps.findIndex(
//       (step) =>
//         step.id ===
//         stepRun.workflow_step_id
//     );

//   if (approvalIndex === -1) {
//     throw new Error(
//       "Approval step does not belong to workflow"
//     );
//   }

//   /*
//    * 8. Continue with steps after
//    * the approval gate.
//    */
//   const remainingSteps =
//     workflow.workflow_steps.slice(
//       approvalIndex + 1
//     );

//   /*
//    * The approval gate's output becomes
//    * the previous output for the next step.
//    */
//   const resumedWorkflow: Workflow = {
//     ...workflow,

//     workflow_steps:
//       remainingSteps,
//   };

//   /*
//    * 9. Resume execution without
//    * recreating the workflow run.
//    *
//    * IMPORTANT:
//    * quota is counted only when the
//    * resumed workflow eventually completes.
//    */
//   return startWorkflow(
//     resumedWorkflow,
//     run.id,
//     "manual",
//     {
//       resumed_from:
//         approvedStepRunId,
//     },
//     {
//       skipRunInitialization: false,

//       previousOutput: {
//         approved: true,
//         approved_by: userId,
//       },

//       quotaAlreadyCounted: false,
//     }
//   );
// }