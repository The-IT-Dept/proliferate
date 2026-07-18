import { MobileOnboardingScreen } from "../src/components/onboarding/MobileOnboardingScreen";
import { useMobileOnboardingStatus } from "../src/hooks/shell/lifecycle/use-mobile-onboarding-status";
import { useMobileAuth } from "../src/providers/MobileAuthProvider";

export default function OnboardingRoute() {
  const { authState } = useMobileAuth();
  const { completeOnboarding } = useMobileOnboardingStatus(authState);

  // MobileOnboardingScreen wraps itself in a SafeAreaView (all edges), so
  // this route renders it directly with no extra wrapper.
  return <MobileOnboardingScreen onDone={() => void completeOnboarding()} />;
}
