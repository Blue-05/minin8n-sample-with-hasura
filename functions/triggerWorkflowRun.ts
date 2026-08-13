import { Request, Response } from "express";
import { authorizeWorkflow, createRun } from "./engine";
import { callerId, input, jsonResponse } from "./_shared";

// export default async function triggerWorkflowRun(
//   req: Request,
//   res: Response
// ) {
//   try {
//     const userId = callerId(req);
//     const body = input(req);
//     const workflowId = body.workflow_id;

//     if (typeof workflowId !== "string") {
//       // Return 200 so Hasura maps it to TriggerWorkflowRunOutput
//       return jsonResponse(res, 200, {
//         success: false,
//         status: "failed",
//         workflow_run_id: null,
//         error: "workflow_id is required",
//         message: "workflow_id is required",
//       });
//     }

//     const { workflow } = await authorizeWorkflow(
//       workflowId,
//       userId
//     );

//     const result = await createRun(
//       workflow,
//       "manual",
//       body.input ?? {}
//     );

//     const errorMessage = result.result.error ?? null;

//     return jsonResponse(res, 200, {
//       success: result.result.status !== "failed",
//       workflow_run_id: result.runId,
//       status: result.result.status,
//       error: errorMessage,
//       message:
//         errorMessage ??
//         (result.result.status === "paused"
//           ? "Workflow paused awaiting approval"
//           : result.result.status === "completed"
//             ? "Workflow completed successfully"
//             : "Workflow execution failed"),
//     });
//   } catch (e: any) {
//     const message =
//       e instanceof Error
//         ? e.message
//         : String(e || "Execution failed");

//     // Return 200 for caught execution errors
//     return jsonResponse(res, 200, {
//       success: false,
//       status: "failed",
//       workflow_run_id: null,
//       error: message,
//       message,
//     });
//   }
// }


export default async function triggerWorkflowRun(
  req: Request,
  res: Response
) {
  console.log("=== triggerWorkflowRun invoked ===");

  try {
    console.log("Method:", req.method);
    console.log("Headers:", req.headers);

    const userId = callerId(req);

    console.log("Caller:", userId);

    const body = input(req);

    console.log("Input:", JSON.stringify(body));

    const workflowId = body.workflow_id;

    if (typeof workflowId !== "string") {
      console.log("Invalid workflow_id");

      return jsonResponse(res, 200, {
        success: false,
        workflow_run_id: null,
        status: "failed",
        error: "workflow_id is required",
        message: "workflow_id is required",
      });
    }

    console.log("Workflow ID:", workflowId);

    const { workflow } = await authorizeWorkflow(
      workflowId,
      userId
    );

    console.log("Workflow authorized:", workflow.id);

    const result = await createRun(
      workflow,
      "manual",
      body.input ?? {}
    );

    console.log(
      "Workflow result:",
      JSON.stringify(result)
    );

    const message =
      result.result.error ??
      (
        result.result.status === "paused"
          ? "Workflow paused awaiting approval"
          : result.result.status === "completed"
            ? "Workflow completed successfully"
            : "Workflow execution failed"
      );

    const response = {
      success: result.result.status !== "failed",
      workflow_run_id: result.runId,
      status: result.result.status,
      error: result.result.error ?? null,
      message,
    };

    console.log(
      "=== RESPONSE ===",
      JSON.stringify(response)
    );

    return jsonResponse(res, 200, response);

  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : String(e);

    console.error(
      "=== triggerWorkflowRun ERROR ==="
    );

    console.error(e);

    const response = {
      success: false,
      workflow_run_id: null,
      status: "failed",
      error: message,
      message,
    };

    console.log(
      "=== ERROR RESPONSE ===",
      JSON.stringify(response)
    );

    return jsonResponse(res, 200, response);
  }
}