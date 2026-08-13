import type { Request, Response } from "express";

import {
  callerId,
  input,
  jsonResponse,
} from "./_shared";

import {
  resumeWorkflow,
} from "./engine";


export default async function approveStep(
  req: Request,
  res: Response
) {
  try {
    // --------------------------------------------------
    // 1. Identify the authenticated user
    // --------------------------------------------------

    const userId = callerId(req);


    // --------------------------------------------------
    // 2. Read the Action input
    // --------------------------------------------------

    const body = input(req);


    // --------------------------------------------------
    // 3. Validate step_run_id
    // --------------------------------------------------

    if (
      typeof body.step_run_id !== "string" ||
      body.step_run_id.length === 0
    ) {
      return jsonResponse(res, 200, {
        success: false,
        workflow_run_id: null,
        status: "failed",
        error: "step_run_id is required",
        message: "step_run_id is required",
      });
    }


    // --------------------------------------------------
    // 4. Resume the workflow
    //
    // resumeWorkflow() is defined as:
    //
    // resumeWorkflow(
    //   approvedStepRunId,
    //   userId
    // )
    // --------------------------------------------------

    const result = await resumeWorkflow(
      body.step_run_id,
      userId
    );


    // --------------------------------------------------
    // 5. Determine whether the operation succeeded
    // --------------------------------------------------

    const success =
      result.status !== "failed";


    // --------------------------------------------------
    // 6. Return the Action response
    // --------------------------------------------------

    return jsonResponse(res, 200, {
      success,

      // resumeWorkflow() does not currently return
      // workflow_run_id, so we don't try to access
      // result.workflow_run_id here.
      workflow_run_id: null,

      status: result.status,

      error:
        result.error ?? null,

      message: success
        ? "Approval accepted and workflow resumed"
        : result.error ?? "Approval failed",
    });

  } catch (error: unknown) {

    // --------------------------------------------------
    // 7. Handle unexpected errors
    // --------------------------------------------------

    const message =
      error instanceof Error
        ? error.message
        : String(error);


    console.error(
      "approveStep failed:",
      error
    );


    // --------------------------------------------------
    // 8. Return a valid Hasura Action response
    // --------------------------------------------------

    return jsonResponse(res, 200, {
      success: false,
      workflow_run_id: null,
      status: "failed",
      error: message,
      message,
    });
  }
}