'use strict';
function localOnboardingValue(ports, environment, fileEnvironment) {
  if (
    ports?.onboardingEnabled !== undefined &&
    typeof ports.onboardingEnabled !== 'boolean'
  )
    throw new Error('Invalid local onboardingEnabled');
  if (environment.AGENT_ONBOARDING_ENABLED !== undefined)
    return environment.AGENT_ONBOARDING_ENABLED;
  if (ports?.onboardingEnabled !== undefined)
    return String(ports.onboardingEnabled);
  return fileEnvironment.AGENT_ONBOARDING_ENABLED;
}
module.exports = { localOnboardingValue };
