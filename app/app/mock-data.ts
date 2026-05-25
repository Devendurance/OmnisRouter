import {
  checkGasCredits,
  defaultBalances,
  parsePaymentIntent,
  resolvePaymentRoute,
  routeRegistry,
  simulatePaymentExecution,
  validateSpendingRules,
  type GasCreditState,
  type SpendingRules,
} from "../router-simulator";

export const defaultCommand = "send 40 USDC to inj1router9xk";

export const defaultRules: SpendingRules = {
  maxTransferAmount: 100,
  dailyTransferLimit: 250,
  approvalThreshold: 25,
  allowedDestinationChains: ["Injective", "Solana"],
  gasCreditLimit: 20,
  emergencyPauseEnabled: false,
};

export const gasCredits: GasCreditState = { monthlyLimit: 20, used: 0, remaining: 20 };

export const recentPayments = [
  { id: "PMT-1042", amount: "40 USDC", route: "Solana -> Injective", status: "Complete" },
  { id: "PMT-1041", amount: "18 USDC", route: "Solana -> Injective", status: "Complete" },
  { id: "PMT-1040", amount: "72 USDC", route: "Solana -> Injective", status: "Approved" },
];

export function getMockPaymentState() {
  const intent = parsePaymentIntent(defaultCommand);
  const route = resolvePaymentRoute(intent, defaultBalances, routeRegistry);
  const ruleResult = validateSpendingRules(intent, defaultRules, route);
  const gas = checkGasCredits(gasCredits);
  const execution = simulatePaymentExecution(intent, route, gas.feeMode, intent.amount);

  return { command: defaultCommand, rules: defaultRules, gasCredits, balances: defaultBalances, intent, route, ruleResult, gas, execution };
}
