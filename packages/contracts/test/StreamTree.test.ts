import { expect } from "chai";
import { ethers } from "hardhat";
import { StreamTree } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("StreamTree", function () {
  let streamTree: StreamTree;
  let owner: HardhatEthersSigner;
  let streamer: HardhatEthersSigner;
  let viewer1: HardhatEthersSigner;
  let viewer2: HardhatEthersSigner;
  let platform: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, streamer, viewer1, viewer2, platform] = await ethers.getSigners();

    const StreamTreeFactory = await ethers.getContractFactory("StreamTree");
    streamTree = await StreamTreeFactory.deploy(platform.address);
    await streamTree.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await streamTree.owner()).to.equal(owner.address);
    });

    it("Should set the correct platform address", async function () {
      expect(await streamTree.platformAddress()).to.equal(platform.address);
    });

    it("Should authorize owner as minter", async function () {
      expect(await streamTree.authorizedMinters(owner.address)).to.be.true;
    });
  });

  describe("Root (Episode) Creation", function () {
    it("Should create a root token", async function () {
      const tx = await streamTree.createRoot(
        streamer.address,
        "episode-123",
        100, // max supply
        "ipfs://metadata/episode-123"
      );

      await expect(tx)
        .to.emit(streamTree, "RootCreated")
        .withArgs(1, streamer.address, "episode-123", 100);

      const root = await streamTree.roots(1);
      expect(root.streamer).to.equal(streamer.address);
      expect(root.episodeId).to.equal("episode-123");
      expect(root.maxSupply).to.equal(100);
      expect(root.branchCount).to.equal(0);
      expect(root.status).to.equal(0); // Active
    });

    it("Should mint root token to streamer", async function () {
      await streamTree.createRoot(
        streamer.address,
        "episode-123",
        100,
        "ipfs://metadata/episode-123"
      );

      expect(await streamTree.ownerOf(1)).to.equal(streamer.address);
    });

    it("Should not allow duplicate episode IDs", async function () {
      await streamTree.createRoot(
        streamer.address,
        "episode-123",
        100,
        "ipfs://metadata/episode-123"
      );

      await expect(
        streamTree.createRoot(
          streamer.address,
          "episode-123",
          100,
          "ipfs://metadata/episode-123-2"
        )
      ).to.be.revertedWith("Episode already exists");
    });

    it("Should allow unlimited supply with 0", async function () {
      await streamTree.createRoot(
        streamer.address,
        "episode-123",
        0, // unlimited
        "ipfs://metadata/episode-123"
      );

      const root = await streamTree.roots(1);
      expect(root.maxSupply).to.equal(0);
    });
  });

  describe("Branch (Card) Minting", function () {
    beforeEach(async function () {
      await streamTree.createRoot(
        streamer.address,
        "episode-123",
        10,
        "ipfs://metadata/episode-123"
      );
    });

    it("Should mint a branch token", async function () {
      const tx = await streamTree.mintBranch(
        1, // rootId
        viewer1.address,
        "card-abc",
        "ipfs://metadata/card-abc"
      );

      await expect(tx)
        .to.emit(streamTree, "BranchMinted")
        .withArgs(1_000_000, 1, viewer1.address, "card-abc", 1);

      const branch = await streamTree.branches(1_000_000);
      expect(branch.rootId).to.equal(1);
      expect(branch.holder).to.equal(viewer1.address);
      expect(branch.cardId).to.equal("card-abc");
      expect(branch.cardNumber).to.equal(1);
      expect(branch.fruited).to.be.false;
    });

    it("Should mint branch token to viewer", async function () {
      await streamTree.mintBranch(
        1,
        viewer1.address,
        "card-abc",
        "ipfs://metadata/card-abc"
      );

      expect(await streamTree.ownerOf(1_000_000)).to.equal(viewer1.address);
    });

    it("Should increment branch count", async function () {
      await streamTree.mintBranch(1, viewer1.address, "card-1", "ipfs://1");
      await streamTree.mintBranch(1, viewer2.address, "card-2", "ipfs://2");

      const root = await streamTree.roots(1);
      expect(root.branchCount).to.equal(2);
    });

    it("Should track branches per root", async function () {
      await streamTree.mintBranch(1, viewer1.address, "card-1", "ipfs://1");
      await streamTree.mintBranch(1, viewer2.address, "card-2", "ipfs://2");

      const branches = await streamTree.getRootBranches(1);
      expect(branches.length).to.equal(2);
      expect(branches[0]).to.equal(1_000_000);
      expect(branches[1]).to.equal(1_000_001);
    });

    it("Should not exceed max supply", async function () {
      // Create root with max 2
      await streamTree.createRoot(
        streamer.address,
        "episode-limited",
        2,
        "ipfs://metadata/limited"
      );

      const rootId = await streamTree.getRootByEpisode("episode-limited");

      await streamTree.mintBranch(rootId, viewer1.address, "card-1", "ipfs://1");
      await streamTree.mintBranch(rootId, viewer2.address, "card-2", "ipfs://2");

      await expect(
        streamTree.mintBranch(rootId, owner.address, "card-3", "ipfs://3")
      ).to.be.revertedWith("Max supply reached");
    });

    it("Should not mint to ended root", async function () {
      await streamTree.endRoot(1);

      await expect(
        streamTree.mintBranch(1, viewer1.address, "card-1", "ipfs://1")
      ).to.be.revertedWith("Root is not active");
    });
  });

  describe("Root Ending", function () {
    beforeEach(async function () {
      await streamTree.createRoot(
        streamer.address,
        "episode-123",
        10,
        "ipfs://metadata/episode-123"
      );
    });

    it("Should end a root", async function () {
      const tx = await streamTree.endRoot(1);

      await expect(tx).to.emit(streamTree, "RootEnded").withArgs(1, 0, await getBlockTimestamp());

      const root = await streamTree.roots(1);
      expect(root.status).to.equal(1); // Ended
      expect(root.endedAt).to.be.gt(0);
    });

    it("Should not end an already ended root", async function () {
      await streamTree.endRoot(1);

      await expect(streamTree.endRoot(1)).to.be.revertedWith("Root already ended");
    });
  });

  describe("Fruit Minting", function () {
    beforeEach(async function () {
      await streamTree.createRoot(
        streamer.address,
        "episode-123",
        10,
        "ipfs://metadata/episode-123"
      );
      await streamTree.mintBranch(1, viewer1.address, "card-abc", "ipfs://card-abc");
    });

    it("Should not mint fruit before root ends", async function () {
      await expect(
        streamTree.mintFruit(1_000_000, 15, 2, "ipfs://fruit-abc")
      ).to.be.revertedWith("Root not ended yet");
    });

    it("Should mint fruit after root ends", async function () {
      await streamTree.endRoot(1);

      const tx = await streamTree.mintFruit(1_000_000, 15, 2, "ipfs://fruit-abc");

      await expect(tx)
        .to.emit(streamTree, "BranchFruited")
        .withArgs(1_000_000, 1_000_000_000, viewer1.address, 15, 2);

      const fruit = await streamTree.fruits(1_000_000_000);
      expect(fruit.branchId).to.equal(1_000_000);
      expect(fruit.rootId).to.equal(1);
      expect(fruit.holder).to.equal(viewer1.address);
      expect(fruit.finalScore).to.equal(15);
      expect(fruit.patterns).to.equal(2);
    });

    it("Should mark branch as fruited", async function () {
      await streamTree.endRoot(1);
      await streamTree.mintFruit(1_000_000, 15, 2, "ipfs://fruit-abc");

      const branch = await streamTree.branches(1_000_000);
      expect(branch.fruited).to.be.true;
    });

    it("Should not fruit the same branch twice", async function () {
      await streamTree.endRoot(1);
      await streamTree.mintFruit(1_000_000, 15, 2, "ipfs://fruit-abc");

      await expect(
        streamTree.mintFruit(1_000_000, 15, 2, "ipfs://fruit-abc-2")
      ).to.be.revertedWith("Branch already fruited");
    });
  });

  describe("Soulbound Fruits", function () {
    beforeEach(async function () {
      await streamTree.createRoot(streamer.address, "episode-123", 10, "ipfs://episode");
      await streamTree.mintBranch(1, viewer1.address, "card-abc", "ipfs://card");
      await streamTree.endRoot(1);
      await streamTree.mintFruit(1_000_000, 15, 2, "ipfs://fruit");
    });

    it("Should identify fruit as soulbound", async function () {
      expect(await streamTree.isSoulbound(1_000_000_000)).to.be.true;
      expect(await streamTree.isSoulbound(1)).to.be.false; // root
      expect(await streamTree.isSoulbound(1_000_000)).to.be.false; // branch
    });

    it("Should not allow fruit transfer", async function () {
      await expect(
        streamTree.connect(viewer1).transferFrom(viewer1.address, viewer2.address, 1_000_000_000)
      ).to.be.revertedWith("Fruit tokens are soulbound");
    });

    it("Should allow root transfer", async function () {
      await streamTree.connect(streamer).transferFrom(streamer.address, viewer1.address, 1);
      expect(await streamTree.ownerOf(1)).to.equal(viewer1.address);
    });

    it("Should allow branch transfer", async function () {
      await streamTree.connect(viewer1).transferFrom(viewer1.address, viewer2.address, 1_000_000);
      expect(await streamTree.ownerOf(1_000_000)).to.equal(viewer2.address);
    });
  });

  describe("Batch Fruit Minting", function () {
    beforeEach(async function () {
      await streamTree.createRoot(streamer.address, "episode-123", 10, "ipfs://episode");
      await streamTree.mintBranch(1, viewer1.address, "card-1", "ipfs://card-1");
      await streamTree.mintBranch(1, viewer2.address, "card-2", "ipfs://card-2");
      await streamTree.endRoot(1);
    });

    it("Should batch mint fruits", async function () {
      const tx = await streamTree.batchMintFruit(
        [1_000_000, 1_000_001],
        [15, 20],
        [2, 3],
        ["ipfs://fruit-1", "ipfs://fruit-2"]
      );

      await expect(tx)
        .to.emit(streamTree, "BranchFruited")
        .withArgs(1_000_000, 1_000_000_000, viewer1.address, 15, 2);

      await expect(tx)
        .to.emit(streamTree, "BranchFruited")
        .withArgs(1_000_001, 1_000_000_001, viewer2.address, 20, 3);

      expect(await streamTree.ownerOf(1_000_000_000)).to.equal(viewer1.address);
      expect(await streamTree.ownerOf(1_000_000_001)).to.equal(viewer2.address);
    });
  });

  describe("Paginated Branch Queries", function () {
    beforeEach(async function () {
      await streamTree.createRoot(streamer.address, "episode-123", 0, "ipfs://episode");
      // Mint 5 branches
      for (let i = 0; i < 5; i++) {
        await streamTree.mintBranch(1, viewer1.address, `card-${i}`, `ipfs://card-${i}`);
      }
    });

    it("Should return paginated branches", async function () {
      const [branchIds, total] = await streamTree.getRootBranchesPaginated(1, 0, 3);
      expect(total).to.equal(5);
      expect(branchIds.length).to.equal(3);
      expect(branchIds[0]).to.equal(1_000_000);
      expect(branchIds[1]).to.equal(1_000_001);
      expect(branchIds[2]).to.equal(1_000_002);
    });

    it("Should return second page of branches", async function () {
      const [branchIds, total] = await streamTree.getRootBranchesPaginated(1, 3, 3);
      expect(total).to.equal(5);
      expect(branchIds.length).to.equal(2); // Only 2 remaining
      expect(branchIds[0]).to.equal(1_000_003);
      expect(branchIds[1]).to.equal(1_000_004);
    });

    it("Should return empty array when offset exceeds total", async function () {
      const [branchIds, total] = await streamTree.getRootBranchesPaginated(1, 10, 5);
      expect(total).to.equal(5);
      expect(branchIds.length).to.equal(0);
    });

    it("Should return empty array for zero limit", async function () {
      const [branchIds, total] = await streamTree.getRootBranchesPaginated(1, 0, 0);
      expect(total).to.equal(5);
      expect(branchIds.length).to.equal(0);
    });

    it("Should return correct branch count", async function () {
      const count = await streamTree.getRootBranchCount(1);
      expect(count).to.equal(5);
    });

    it("Should return zero count for non-existent root", async function () {
      const count = await streamTree.getRootBranchCount(999);
      expect(count).to.equal(0);
    });
  });

  describe("Edge Cases", function () {
    it("Should reject empty episode ID", async function () {
      await expect(
        streamTree.createRoot(streamer.address, "", 10, "ipfs://metadata")
      ).to.be.revertedWith("Empty episode ID");
    });

    it("Should reject zero address for streamer", async function () {
      await expect(
        streamTree.createRoot(ethers.ZeroAddress, "episode-1", 10, "ipfs://metadata")
      ).to.be.revertedWith("Invalid streamer address");
    });

    it("Should reject empty card ID", async function () {
      await streamTree.createRoot(streamer.address, "episode-1", 10, "ipfs://episode");
      await expect(
        streamTree.mintBranch(1, viewer1.address, "", "ipfs://card")
      ).to.be.revertedWith("Empty card ID");
    });

    it("Should reject zero address for holder", async function () {
      await streamTree.createRoot(streamer.address, "episode-1", 10, "ipfs://episode");
      await expect(
        streamTree.mintBranch(1, ethers.ZeroAddress, "card-1", "ipfs://card")
      ).to.be.revertedWith("Invalid holder address");
    });

    it("Should reject duplicate card IDs", async function () {
      await streamTree.createRoot(streamer.address, "episode-1", 10, "ipfs://episode");
      await streamTree.mintBranch(1, viewer1.address, "card-1", "ipfs://card");
      await expect(
        streamTree.mintBranch(1, viewer2.address, "card-1", "ipfs://card-2")
      ).to.be.revertedWith("Card already exists");
    });

    it("Should reject minting for non-existent root", async function () {
      await expect(
        streamTree.mintBranch(999, viewer1.address, "card-1", "ipfs://card")
      ).to.be.revertedWith("Root does not exist");
    });

    it("Should reject fruiting non-existent branch", async function () {
      await expect(
        streamTree.mintFruit(999, 10, 1, "ipfs://fruit")
      ).to.be.revertedWith("Branch does not exist");
    });

    it("Should reject batch with array length mismatch", async function () {
      await streamTree.createRoot(streamer.address, "episode-1", 10, "ipfs://episode");
      await streamTree.mintBranch(1, viewer1.address, "card-1", "ipfs://card");
      await streamTree.endRoot(1);

      await expect(
        streamTree.batchMintFruit(
          [1_000_000],
          [10, 20], // mismatched length
          [1],
          ["ipfs://fruit"]
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should reject zero address for platform", async function () {
      await expect(
        streamTree.setPlatformAddress(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("Should emit PlatformAddressUpdated event", async function () {
      const tx = await streamTree.setPlatformAddress(viewer1.address);
      await expect(tx)
        .to.emit(streamTree, "PlatformAddressUpdated")
        .withArgs(platform.address, viewer1.address);
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to authorize minters", async function () {
      await streamTree.setAuthorizedMinter(viewer1.address, true);
      expect(await streamTree.authorizedMinters(viewer1.address)).to.be.true;
    });

    it("Should not allow non-owner to authorize minters", async function () {
      await expect(
        streamTree.connect(viewer1).setAuthorizedMinter(viewer2.address, true)
      ).to.be.revertedWithCustomError(streamTree, "OwnableUnauthorizedAccount");
    });

    it("Should not allow unauthorized minter to create root", async function () {
      await expect(
        streamTree.connect(viewer1).createRoot(
          streamer.address,
          "episode-123",
          10,
          "ipfs://metadata"
        )
      ).to.be.revertedWith("Not authorized minter");
    });

    it("Should allow authorized minter to create root", async function () {
      await streamTree.setAuthorizedMinter(viewer1.address, true);

      await expect(
        streamTree.connect(viewer1).createRoot(
          streamer.address,
          "episode-123",
          10,
          "ipfs://metadata"
        )
      ).to.emit(streamTree, "RootCreated");
    });
  });

  // Helper function
  async function getBlockTimestamp(): Promise<number> {
    const block = await ethers.provider.getBlock("latest");
    return block?.timestamp || 0;
  }
});
