# MVP Test Checklist

- Valid Solana -> Injective transfer: enter `send 40 USDC to inj1router9xk`, approve, confirm balances move from Solana to Injective.
- Valid Injective -> Solana transfer: enter `send 12 USDC to 9xQeWvG816bUx9EPfN9xQeWvG816bUx9EPfN`, approve, confirm balances move from Injective to Solana.
- Valid Solana address: paste a real Solana public key, confirm `Valid recipient address` and `Detected chain type: Solana`.
- Shortened Solana address: paste a truncated Solana address, confirm invalid address warning and no approval route.
- Random base58 string: paste base58 text that is not a valid Solana PublicKey, confirm invalid address warning.
- Valid Injective inj address: paste a valid Bech32 `inj...` account, confirm `Detected chain type: Injective`.
- Broken Injective address: paste malformed `inj...`, confirm invalid Bech32 warning.
- Valid EVM 0x address: paste a valid 42-character `0x...` address, confirm EVM warning and route blocked.
- Short 0x address: paste short `0x...`, confirm invalid EVM address warning.
- Unknown/random text: paste random text, confirm unknown recipient address warning.
- EVM unsupported: enter `send 10 USDC to 0x1234567890abcdef`, confirm approval/payment are blocked with the MVP EVM-chain explanation.
- Unknown unsupported: enter `send 10 USDC to not-an-address`, confirm the UI asks for a valid Solana or Injective address.
- Transfer above max amount: set max transfer amount below command amount, save rules, confirm payment denied.
- Transfer above approval threshold: set approval threshold below command amount, save rules, confirm approval required.
- Emergency pause enabled: enable emergency pause, save rules, confirm approval/payment show `Agent spending is paused. Disable emergency pause to continue.`
- Gas credits remaining: keep used credits below monthly limit, simulate payment, confirm gas credit applied and used increments by 1.
- Gas credits exhausted: set gas credit limit to 0 or simulate until remaining is 0, confirm gas credits exhausted and fee options A/B are visible.
- Reset mock state: click dashboard reset, confirm balances, rules, gas credits, command, and latest receipt return to defaults.
