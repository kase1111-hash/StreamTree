import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';

// SECURITY: Validate and protect private key
// Private keys are extremely sensitive - never log them
function validatePrivateKey(key: string | undefined): string | null {
  if (!key) return null;

  // Remove 0x prefix if present for validation
  const cleanKey = key.startsWith('0x') ? key.slice(2) : key;

  // Private keys should be 64 hex characters (32 bytes)
  if (!/^[a-fA-F0-9]{64}$/.test(cleanKey)) {
    console.error('SECURITY: L2_PRIVATE_KEY has invalid format (expected 64 hex chars)');
    return null;
  }

  // Return with 0x prefix for ethers
  return key.startsWith('0x') ? key : `0x${key}`;
}

// StreamTree ABI (only the functions we need)
const STREAMTREE_ABI = [
  // Root functions
  'function createRoot(address streamer, string episodeId, uint256 maxSupply, string metadataUri) external returns (uint256)',
  'function endRoot(uint256 rootId) external',
  'function roots(uint256 rootId) external view returns (address streamer, string episodeId, uint256 maxSupply, uint256 branchCount, uint8 status, uint256 createdAt, uint256 endedAt)',
  'function getRootByEpisode(string episodeId) external view returns (uint256)',

  // Branch functions
  'function mintBranch(uint256 rootId, address holder, string cardId, string metadataUri) external returns (uint256)',
  'function branches(uint256 branchId) external view returns (uint256 rootId, address holder, string cardId, uint256 cardNumber, bool fruited, uint256 mintedAt)',
  'function getBranchByCard(string cardId) external view returns (uint256)',

  // Fruit functions
  'function mintFruit(uint256 branchId, uint256 finalScore, uint256 patterns, string metadataUri) external returns (uint256)',
  'function batchMintFruit(uint256[] branchIds, uint256[] finalScores, uint256[] patternsArr, string[] metadataUris) external returns (uint256[])',
  'function fruits(uint256 fruitId) external view returns (uint256 branchId, uint256 rootId, address holder, uint256 finalScore, uint256 patterns, uint256 fruitedAt)',
  'function branchToFruit(uint256 branchId) external view returns (uint256)',

  // View functions
  'function tokenType(uint256 tokenId) external view returns (uint8)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function tokenURI(uint256 tokenId) external view returns (string)',

  // Events
  'event RootCreated(uint256 indexed rootId, address indexed streamer, string episodeId, uint256 maxSupply)',
  'event BranchMinted(uint256 indexed branchId, uint256 indexed rootId, address indexed holder, string cardId, uint256 cardNumber)',
  'event BranchFruited(uint256 indexed branchId, uint256 indexed fruitId, address indexed holder, uint256 finalScore, uint256 patterns)',
  'event RootEnded(uint256 indexed rootId, uint256 branchCount, uint256 timestamp)',
];

// SECURITY: Validate private key at module load time
const validatedPrivateKey = validatePrivateKey(process.env.L2_PRIVATE_KEY);

// Check if blockchain is configured
const isConfigured = !!(
  process.env.L2_RPC_URL &&
  validatedPrivateKey &&
  process.env.STREAMTREE_CONTRACT_ADDRESS
);

let provider: JsonRpcProvider | null = null;
let wallet: Wallet | null = null;
let contract: Contract | null = null;

if (isConfigured) {
  try {
    provider = new JsonRpcProvider(process.env.L2_RPC_URL);
    // SECURITY: Use validated private key, never log it
    wallet = new Wallet(validatedPrivateKey!, provider);
    contract = new Contract(
      process.env.STREAMTREE_CONTRACT_ADDRESS!,
      STREAMTREE_ABI,
      wallet
    );
    console.log('Blockchain service initialized');
    console.log('Contract address:', process.env.STREAMTREE_CONTRACT_ADDRESS);
    // SECURITY: Log wallet address (safe) but NEVER the private key
    console.log('Wallet address:', wallet.address);
  } catch (error) {
    // SECURITY: Sanitize error to prevent private key leakage
    const sanitizedError = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to initialize blockchain service:', sanitizedError);
  }
} else {
  if (process.env.L2_PRIVATE_KEY && !validatedPrivateKey) {
    console.error('SECURITY WARNING: L2_PRIVATE_KEY is set but invalid - blockchain disabled');
  } else {
    console.log('Blockchain service not configured - running in offline mode');
  }
}

export function isBlockchainConfigured(): boolean {
  return isConfigured && contract !== null;
}

export interface RootTokenResult {
  tokenId: string;
  transactionHash: string;
}

export interface BranchTokenResult {
  tokenId: string;
  transactionHash: string;
}

export interface FruitTokenResult {
  tokenId: string;
  transactionHash: string;
}

/**
 * Create a root token for an episode
 */
export async function createRootToken(
  streamerAddress: string,
  episodeId: string,
  maxSupply: number,
  metadataUri: string
): Promise<RootTokenResult | null> {
  if (!contract) {
    console.log('Blockchain not configured, skipping root token creation');
    return null;
  }

  try {
    console.log('Creating root token for episode:', episodeId);

    const tx = await contract.createRoot(
      streamerAddress,
      episodeId,
      maxSupply,
      metadataUri
    );

    console.log('Transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);

    // Parse the RootCreated event to get the token ID
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = contract!.interface.parseLog(log);
        return parsed?.name === 'RootCreated';
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = contract.interface.parseLog(event);
      const tokenId = parsed!.args[0].toString();
      console.log('Root token created:', tokenId);

      return {
        tokenId,
        transactionHash: tx.hash,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to create root token:', error);
    throw error;
  }
}

/**
 * End a root (episode)
 */
export async function endRootToken(rootTokenId: string): Promise<string | null> {
  if (!contract) {
    console.log('Blockchain not configured, skipping root end');
    return null;
  }

  try {
    console.log('Ending root token:', rootTokenId);

    const tx = await contract.endRoot(rootTokenId);
    console.log('Transaction sent:', tx.hash);

    await tx.wait();
    console.log('Root ended successfully');

    return tx.hash;
  } catch (error) {
    console.error('Failed to end root token:', error);
    throw error;
  }
}

/**
 * Mint a branch token for a card
 */
export async function mintBranchToken(
  rootTokenId: string,
  holderAddress: string,
  cardId: string,
  metadataUri: string
): Promise<BranchTokenResult | null> {
  if (!contract) {
    console.log('Blockchain not configured, skipping branch token minting');
    return null;
  }

  try {
    console.log('Minting branch token for card:', cardId);

    const tx = await contract.mintBranch(
      rootTokenId,
      holderAddress,
      cardId,
      metadataUri
    );

    console.log('Transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);

    // Parse the BranchMinted event to get the token ID
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = contract!.interface.parseLog(log);
        return parsed?.name === 'BranchMinted';
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = contract.interface.parseLog(event);
      const tokenId = parsed!.args[0].toString();
      console.log('Branch token minted:', tokenId);

      return {
        tokenId,
        transactionHash: tx.hash,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to mint branch token:', error);
    throw error;
  }
}

/**
 * Mint a fruit token for a card
 */
export async function mintFruitToken(
  branchTokenId: string,
  finalScore: number,
  patterns: number,
  metadataUri: string
): Promise<FruitTokenResult | null> {
  if (!contract) {
    console.log('Blockchain not configured, skipping fruit token minting');
    return null;
  }

  try {
    console.log('Minting fruit token for branch:', branchTokenId);

    const tx = await contract.mintFruit(
      branchTokenId,
      finalScore,
      patterns,
      metadataUri
    );

    console.log('Transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);

    // Parse the BranchFruited event to get the token ID
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = contract!.interface.parseLog(log);
        return parsed?.name === 'BranchFruited';
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = contract.interface.parseLog(event);
      const tokenId = parsed!.args[1].toString();
      console.log('Fruit token minted:', tokenId);

      return {
        tokenId,
        transactionHash: tx.hash,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to mint fruit token:', error);
    throw error;
  }
}

/**
 * Batch mint fruit tokens
 */
export async function batchMintFruitTokens(
  branchTokenIds: string[],
  finalScores: number[],
  patterns: number[],
  metadataUris: string[]
): Promise<FruitTokenResult[] | null> {
  if (!contract) {
    console.log('Blockchain not configured, skipping batch fruit minting');
    return null;
  }

  try {
    console.log('Batch minting fruit tokens for', branchTokenIds.length, 'branches');

    const tx = await contract.batchMintFruit(
      branchTokenIds,
      finalScores,
      patterns,
      metadataUris
    );

    console.log('Transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);

    // Parse all BranchFruited events
    const results: FruitTokenResult[] = [];

    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'BranchFruited') {
          results.push({
            tokenId: parsed.args[1].toString(),
            transactionHash: tx.hash,
          });
        }
      } catch {
        // Skip unparseable logs
      }
    }

    console.log('Batch minted', results.length, 'fruit tokens');
    return results;
  } catch (error) {
    console.error('Failed to batch mint fruit tokens:', error);
    throw error;
  }
}

/**
 * Get root token ID by episode ID
 */
export async function getRootByEpisode(episodeId: string): Promise<string | null> {
  if (!contract) return null;

  try {
    const rootId = await contract.getRootByEpisode(episodeId);
    return rootId.toString() === '0' ? null : rootId.toString();
  } catch (error) {
    console.error('Failed to get root by episode:', error);
    return null;
  }
}

/**
 * Get branch token ID by card ID
 */
export async function getBranchByCard(cardId: string): Promise<string | null> {
  if (!contract) return null;

  try {
    const branchId = await contract.getBranchByCard(cardId);
    return branchId.toString() === '0' ? null : branchId.toString();
  } catch (error) {
    console.error('Failed to get branch by card:', error);
    return null;
  }
}

/**
 * Get owner of a token
 */
export async function getTokenOwner(tokenId: string): Promise<string | null> {
  if (!contract) return null;

  try {
    return await contract.ownerOf(tokenId);
  } catch (error) {
    console.error('Failed to get token owner:', error);
    return null;
  }
}

/**
 * Get token URI
 */
export async function getTokenURI(tokenId: string): Promise<string | null> {
  if (!contract) return null;

  try {
    return await contract.tokenURI(tokenId);
  } catch (error) {
    console.error('Failed to get token URI:', error);
    return null;
  }
}

/**
 * Generate IPFS metadata URI for a token
 * In production, this would upload to IPFS
 * For now, we use a simple URL pattern
 */
export function generateMetadataUri(
  type: 'root' | 'branch' | 'fruit',
  id: string,
  data: Record<string, unknown>
): string {
  // In production, upload to IPFS and return ipfs:// URI
  // For now, return API endpoint that serves metadata
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  return `${baseUrl}/api/metadata/${type}/${id}`;
}

/**
 * Verify a wallet signature
 */
export function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Check if an address is valid
 */
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

/**
 * Get the network info
 */
export async function getNetworkInfo(): Promise<{
  chainId: number;
  name: string;
} | null> {
  if (!provider) return null;

  try {
    const network = await provider.getNetwork();
    return {
      chainId: Number(network.chainId),
      name: network.name,
    };
  } catch (error) {
    console.error('Failed to get network info:', error);
    return null;
  }
}

/**
 * Get contract address
 */
export function getContractAddress(): string | null {
  return process.env.STREAMTREE_CONTRACT_ADDRESS || null;
}
