const INJECTIVE_TESTNET_EXPLORER_TX_URL = "https://testnet.explorer.injective.network/transaction/";

export function injectiveTestnetTxUrl(txHash: string): string {
  return `${INJECTIVE_TESTNET_EXPLORER_TX_URL}${txHash}`;
}

export function shortenHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 3) {
    return hash;
  }

  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}
