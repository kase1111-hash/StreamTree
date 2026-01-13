// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title StreamTree
 * @dev NFTree implementation for StreamTree - interactive bingo for streamers
 *
 * Token Types:
 * - Root (Episode): Created when a streamer launches an episode
 * - Branch (Card): Created when a viewer mints a card
 * - Fruit (Collectible): Created when episode ends, proving participation
 *
 * The NFTree pattern: Root → Branch → Fruit
 * Each branch belongs to one root, each fruit belongs to one branch.
 */
contract StreamTree is ERC721, ERC721URIStorage, ERC721Enumerable, Ownable, ReentrancyGuard {

    // ============ Enums ============

    enum TokenType { Root, Branch, Fruit }
    enum RootStatus { Active, Ended }

    // ============ Structs ============

    struct Root {
        address streamer;
        string episodeId;       // Off-chain episode ID
        uint256 maxSupply;      // Max branches (0 = unlimited)
        uint256 branchCount;    // Current branch count
        RootStatus status;
        uint256 createdAt;
        uint256 endedAt;
    }

    struct Branch {
        uint256 rootId;
        address holder;
        string cardId;          // Off-chain card ID
        uint256 cardNumber;     // Sequential number within episode
        bool fruited;           // Whether fruit has been minted
        uint256 mintedAt;
    }

    struct Fruit {
        uint256 branchId;
        uint256 rootId;
        address holder;
        uint256 finalScore;     // Marked squares at end
        uint256 patterns;       // Number of patterns completed
        uint256 fruitedAt;
    }

    // ============ State ============

    // Token ID counters
    uint256 private _nextRootId = 1;
    uint256 private _nextBranchId = 1_000_000;      // Start at 1M for branches
    uint256 private _nextFruitId = 1_000_000_000;   // Start at 1B for fruits

    // Token type mapping
    mapping(uint256 => TokenType) public tokenType;

    // Token data
    mapping(uint256 => Root) public roots;
    mapping(uint256 => Branch) public branches;
    mapping(uint256 => Fruit) public fruits;

    // Lookup mappings
    mapping(string => uint256) public episodeToRoot;      // episodeId => rootId
    mapping(string => uint256) public cardToBranch;       // cardId => branchId
    mapping(uint256 => uint256[]) public rootBranches;    // rootId => branchIds
    mapping(uint256 => uint256) public branchToFruit;     // branchId => fruitId

    // Authorized minters (backend service)
    mapping(address => bool) public authorizedMinters;

    // Platform address for fees
    address public platformAddress;

    // ============ Events ============

    event RootCreated(
        uint256 indexed rootId,
        address indexed streamer,
        string episodeId,
        uint256 maxSupply
    );

    event BranchMinted(
        uint256 indexed branchId,
        uint256 indexed rootId,
        address indexed holder,
        string cardId,
        uint256 cardNumber
    );

    event BranchFruited(
        uint256 indexed branchId,
        uint256 indexed fruitId,
        address indexed holder,
        uint256 finalScore,
        uint256 patterns
    );

    event RootEnded(
        uint256 indexed rootId,
        uint256 branchCount,
        uint256 timestamp
    );

    event MinterAuthorized(address indexed minter, bool authorized);

    // ============ Modifiers ============

    modifier onlyAuthorizedMinter() {
        require(authorizedMinters[msg.sender] || msg.sender == owner(), "Not authorized minter");
        _;
    }

    modifier rootExists(uint256 rootId) {
        require(roots[rootId].streamer != address(0), "Root does not exist");
        _;
    }

    modifier branchExists(uint256 branchId) {
        require(branches[branchId].holder != address(0), "Branch does not exist");
        _;
    }

    // ============ Constructor ============

    constructor(address _platformAddress) ERC721("StreamTree", "STREE") Ownable(msg.sender) {
        platformAddress = _platformAddress;
        authorizedMinters[msg.sender] = true;
    }

    // ============ Root Functions ============

    /**
     * @dev Create a new root (episode) token
     * @param streamer Address of the streamer
     * @param episodeId Off-chain episode identifier
     * @param maxSupply Maximum number of branches (0 for unlimited)
     * @param metadataUri Token metadata URI
     */
    function createRoot(
        address streamer,
        string calldata episodeId,
        uint256 maxSupply,
        string calldata metadataUri
    ) external onlyAuthorizedMinter returns (uint256) {
        require(streamer != address(0), "Invalid streamer address");
        require(bytes(episodeId).length > 0, "Empty episode ID");
        require(episodeToRoot[episodeId] == 0, "Episode already exists");

        uint256 rootId = _nextRootId++;

        roots[rootId] = Root({
            streamer: streamer,
            episodeId: episodeId,
            maxSupply: maxSupply,
            branchCount: 0,
            status: RootStatus.Active,
            createdAt: block.timestamp,
            endedAt: 0
        });

        tokenType[rootId] = TokenType.Root;
        episodeToRoot[episodeId] = rootId;

        _safeMint(streamer, rootId);
        _setTokenURI(rootId, metadataUri);

        emit RootCreated(rootId, streamer, episodeId, maxSupply);

        return rootId;
    }

    /**
     * @dev End a root (episode), preventing new branches
     * @param rootId The root token ID
     */
    function endRoot(uint256 rootId) external onlyAuthorizedMinter rootExists(rootId) {
        Root storage root = roots[rootId];
        require(root.status == RootStatus.Active, "Root already ended");

        root.status = RootStatus.Ended;
        root.endedAt = block.timestamp;

        emit RootEnded(rootId, root.branchCount, block.timestamp);
    }

    // ============ Branch Functions ============

    /**
     * @dev Mint a new branch (card) token
     * @param rootId The root this branch belongs to
     * @param holder Address of the card holder
     * @param cardId Off-chain card identifier
     * @param metadataUri Token metadata URI
     */
    function mintBranch(
        uint256 rootId,
        address holder,
        string calldata cardId,
        string calldata metadataUri
    ) external onlyAuthorizedMinter rootExists(rootId) nonReentrant returns (uint256) {
        Root storage root = roots[rootId];
        require(root.status == RootStatus.Active, "Root is not active");
        require(holder != address(0), "Invalid holder address");
        require(bytes(cardId).length > 0, "Empty card ID");
        require(cardToBranch[cardId] == 0, "Card already exists");

        if (root.maxSupply > 0) {
            require(root.branchCount < root.maxSupply, "Max supply reached");
        }

        uint256 branchId = _nextBranchId++;
        uint256 cardNumber = root.branchCount + 1;

        branches[branchId] = Branch({
            rootId: rootId,
            holder: holder,
            cardId: cardId,
            cardNumber: cardNumber,
            fruited: false,
            mintedAt: block.timestamp
        });

        tokenType[branchId] = TokenType.Branch;
        cardToBranch[cardId] = branchId;
        rootBranches[rootId].push(branchId);
        root.branchCount++;

        _safeMint(holder, branchId);
        _setTokenURI(branchId, metadataUri);

        emit BranchMinted(branchId, rootId, holder, cardId, cardNumber);

        return branchId;
    }

    // ============ Fruit Functions ============

    /**
     * @dev Mint a fruit token from a branch (soulbound)
     * @param branchId The branch to fruit
     * @param finalScore Final score (marked squares)
     * @param patterns Number of patterns completed
     * @param metadataUri Token metadata URI
     */
    function mintFruit(
        uint256 branchId,
        uint256 finalScore,
        uint256 patterns,
        string calldata metadataUri
    ) external onlyAuthorizedMinter branchExists(branchId) nonReentrant returns (uint256) {
        Branch storage branch = branches[branchId];
        require(!branch.fruited, "Branch already fruited");

        Root storage root = roots[branch.rootId];
        require(root.status == RootStatus.Ended, "Root not ended yet");

        uint256 fruitId = _nextFruitId++;

        fruits[fruitId] = Fruit({
            branchId: branchId,
            rootId: branch.rootId,
            holder: branch.holder,
            finalScore: finalScore,
            patterns: patterns,
            fruitedAt: block.timestamp
        });

        tokenType[fruitId] = TokenType.Fruit;
        branchToFruit[branchId] = fruitId;
        branch.fruited = true;

        _safeMint(branch.holder, fruitId);
        _setTokenURI(fruitId, metadataUri);

        emit BranchFruited(branchId, fruitId, branch.holder, finalScore, patterns);

        return fruitId;
    }

    /**
     * @dev Batch mint fruits for multiple branches
     * @param branchIds Array of branch IDs to fruit
     * @param finalScores Array of final scores
     * @param patternsArr Array of pattern counts
     * @param metadataUris Array of metadata URIs
     */
    function batchMintFruit(
        uint256[] calldata branchIds,
        uint256[] calldata finalScores,
        uint256[] calldata patternsArr,
        string[] calldata metadataUris
    ) external onlyAuthorizedMinter nonReentrant returns (uint256[] memory) {
        require(
            branchIds.length == finalScores.length &&
            branchIds.length == patternsArr.length &&
            branchIds.length == metadataUris.length,
            "Array length mismatch"
        );
        require(branchIds.length <= 50, "Batch too large");

        uint256[] memory fruitIds = new uint256[](branchIds.length);

        for (uint256 i = 0; i < branchIds.length; i++) {
            uint256 branchId = branchIds[i];
            Branch storage branch = branches[branchId];

            require(branch.holder != address(0), "Branch does not exist");
            require(!branch.fruited, "Branch already fruited");

            Root storage root = roots[branch.rootId];
            require(root.status == RootStatus.Ended, "Root not ended yet");

            uint256 fruitId = _nextFruitId++;

            fruits[fruitId] = Fruit({
                branchId: branchId,
                rootId: branch.rootId,
                holder: branch.holder,
                finalScore: finalScores[i],
                patterns: patternsArr[i],
                fruitedAt: block.timestamp
            });

            tokenType[fruitId] = TokenType.Fruit;
            branchToFruit[branchId] = fruitId;
            branch.fruited = true;

            _safeMint(branch.holder, fruitId);
            _setTokenURI(fruitId, metadataUris[i]);

            emit BranchFruited(branchId, fruitId, branch.holder, finalScores[i], patternsArr[i]);

            fruitIds[i] = fruitId;
        }

        return fruitIds;
    }

    // ============ View Functions ============

    /**
     * @dev Get all branches for a root
     */
    function getRootBranches(uint256 rootId) external view returns (uint256[] memory) {
        return rootBranches[rootId];
    }

    /**
     * @dev Get root ID by episode ID
     */
    function getRootByEpisode(string calldata episodeId) external view returns (uint256) {
        return episodeToRoot[episodeId];
    }

    /**
     * @dev Get branch ID by card ID
     */
    function getBranchByCard(string calldata cardId) external view returns (uint256) {
        return cardToBranch[cardId];
    }

    /**
     * @dev Check if a token is soulbound (fruits are soulbound)
     */
    function isSoulbound(uint256 tokenId) public view returns (bool) {
        return tokenType[tokenId] == TokenType.Fruit;
    }

    // ============ Admin Functions ============

    /**
     * @dev Authorize or revoke a minter
     */
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterAuthorized(minter, authorized);
    }

    /**
     * @dev Update platform address
     */
    function setPlatformAddress(address _platformAddress) external onlyOwner {
        require(_platformAddress != address(0), "Invalid address");
        platformAddress = _platformAddress;
    }

    // ============ Overrides ============

    /**
     * @dev Override transfer to make fruits soulbound
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        address from = _ownerOf(tokenId);

        // Fruits are soulbound - only allow minting (from == 0)
        if (tokenType[tokenId] == TokenType.Fruit && from != address(0)) {
            revert("Fruit tokens are soulbound");
        }

        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
