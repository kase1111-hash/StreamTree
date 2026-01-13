import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Get platform address from env or use deployer
  const platformAddress = process.env.PLATFORM_ADDRESS || deployer.address;
  console.log("Platform address:", platformAddress);

  // Deploy StreamTree contract
  const StreamTree = await ethers.getContractFactory("StreamTree");
  const streamTree = await StreamTree.deploy(platformAddress);
  await streamTree.waitForDeployment();

  const contractAddress = await streamTree.getAddress();
  console.log("StreamTree deployed to:", contractAddress);

  // If a backend minter address is provided, authorize it
  const backendMinter = process.env.BACKEND_MINTER_ADDRESS;
  if (backendMinter && backendMinter !== deployer.address) {
    console.log("Authorizing backend minter:", backendMinter);
    const tx = await streamTree.setAuthorizedMinter(backendMinter, true);
    await tx.wait();
    console.log("Backend minter authorized");
  }

  console.log("\n=== Deployment Summary ===");
  console.log("Contract Address:", contractAddress);
  console.log("Platform Address:", platformAddress);
  console.log("Deployer:", deployer.address);
  if (backendMinter) {
    console.log("Backend Minter:", backendMinter);
  }

  // Output deployment info for use in backend
  console.log("\n=== Add to .env ===");
  console.log(`STREAMTREE_CONTRACT_ADDRESS=${contractAddress}`);

  return { contractAddress, platformAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
