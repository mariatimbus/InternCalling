export function opportunityCopilotEnabled() {
  return process.env.OPPORTUNITY_COPILOT_ENABLED === "true";
}

export function profileInsightsEnabled() {
  return process.env.PROFILE_INSIGHTS_ENABLED === "true";
}
