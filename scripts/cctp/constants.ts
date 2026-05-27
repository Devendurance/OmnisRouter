export const CCTP_DOMAINS = {
  Injective: 29,
  Solana: 5,
} as const;

export const INJECTIVE_TESTNET_CCTP = {
  USDC: "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
  TokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  MessageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  TokenMinterV2: "0xb43db544E2c27092c107639Ad201b3dEfAbcF192",
  MessageV2: "0xbaC0179bB358A8936169a63408C8481D582390C4",
} as const;

export const SOLANA_DEVNET_CCTP = {
  UsdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  TokenMessengerV2Program: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe",
  MessageTransmitterV2Program: "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC",
} as const;

export const CCTP_TEST_ROUTES = [
  {
    from: "Injective",
    to: "Solana",
    sourceDomain: CCTP_DOMAINS.Injective,
    destinationDomain: CCTP_DOMAINS.Solana,
  },
  {
    from: "Solana",
    to: "Injective",
    sourceDomain: CCTP_DOMAINS.Solana,
    destinationDomain: CCTP_DOMAINS.Injective,
  },
] as const;
