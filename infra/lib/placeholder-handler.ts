/**
 * Synth-time placeholder Lambda source.
 *
 * Lets every Lambda construct synthesize without a pre-built backend asset. The real
 * handlers are deployed from backend/ by the CI/CD pipeline after the build agents
 * implement them; CDK swaps the code at deploy time. Returning 503 makes it obvious if
 * a placeholder ever reaches an environment by mistake.
 */
export const PLACEHOLDER_HANDLER = `
exports.handler = async (event) => {
  console.log("keiras-journey placeholder handler invoked", JSON.stringify(event));
  return {
    statusCode: 503,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      error: {
        code: "not_implemented",
        message: "Placeholder handler — real code is deployed from backend/ by CI/CD."
      }
    })
  };
};
`;
