import { Router } from 'express';
import { prisma } from '../db/client.js';
import { metadataRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

// SECURITY: Apply rate limiting to all metadata endpoints
// This prevents enumeration attacks and DDoS while allowing NFT marketplace indexing
router.use(metadataRateLimiter);

/**
 * NFT Metadata endpoints
 * These endpoints serve metadata for the StreamTree NFTs following ERC721 metadata standards
 */

// Get root (episode) token metadata
router.get('/root/:id', async (req, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      include: {
        streamer: {
          select: { username: true, displayName: true },
        },
        _count: {
          select: { cards: true, eventDefinitions: true },
        },
      },
    });

    if (!episode) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    const metadata = {
      name: `StreamTree: ${episode.name}`,
      description: `Episode Root NFT for "${episode.name}" by ${episode.streamer.displayName || episode.streamer.username}`,
      image: episode.artworkUrl || `${process.env.BASE_URL}/default-episode.png`,
      external_url: `${process.env.BASE_URL}/episode/${episode.shareCode}`,
      attributes: [
        {
          trait_type: 'Type',
          value: 'Root',
        },
        {
          trait_type: 'Streamer',
          value: episode.streamer.displayName || episode.streamer.username,
        },
        {
          trait_type: 'Grid Size',
          value: episode.gridSize,
          display_type: 'number',
        },
        {
          trait_type: 'Max Cards',
          value: episode.maxCards || 'Unlimited',
        },
        {
          trait_type: 'Cards Minted',
          value: episode._count.cards,
          display_type: 'number',
        },
        {
          trait_type: 'Total Events',
          value: episode._count.eventDefinitions,
          display_type: 'number',
        },
        {
          trait_type: 'Status',
          value: episode.status,
        },
        {
          trait_type: 'Created',
          value: Math.floor(episode.createdAt.getTime() / 1000),
          display_type: 'date',
        },
      ],
    };

    res.json(metadata);
  } catch (error) {
    next(error);
  }
});

// Get branch (card) token metadata
router.get('/branch/:id', async (req, res, next) => {
  try {
    const card = await prisma.card.findUnique({
      where: { id: req.params.id },
      include: {
        episode: {
          select: {
            name: true,
            artworkUrl: true,
            gridSize: true,
            shareCode: true,
          },
        },
        holder: {
          select: { username: true, displayName: true },
        },
      },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const metadata = {
      name: `StreamTree Card #${card.cardNumber} - ${card.episode.name}`,
      description: `Bingo card #${card.cardNumber} for "${card.episode.name}"`,
      image: card.episode.artworkUrl || `${process.env.BASE_URL}/default-card.png`,
      external_url: `${process.env.BASE_URL}/card/${card.id}`,
      attributes: [
        {
          trait_type: 'Type',
          value: 'Branch',
        },
        {
          trait_type: 'Card Number',
          value: card.cardNumber,
          display_type: 'number',
        },
        {
          trait_type: 'Episode',
          value: card.episode.name,
        },
        {
          trait_type: 'Grid Size',
          value: card.episode.gridSize,
          display_type: 'number',
        },
        {
          trait_type: 'Holder',
          value: card.holder.displayName || card.holder.username,
        },
        {
          trait_type: 'Status',
          value: card.status,
        },
        {
          trait_type: 'Minted',
          value: Math.floor(card.mintedAt.getTime() / 1000),
          display_type: 'date',
        },
      ],
    };

    res.json(metadata);
  } catch (error) {
    next(error);
  }
});

// Get fruit (collectible) token metadata
router.get('/fruit/:id', async (req, res, next) => {
  try {
    const card = await prisma.card.findUnique({
      where: { id: req.params.id },
      include: {
        episode: {
          select: {
            name: true,
            artworkUrl: true,
            gridSize: true,
            shareCode: true,
          },
        },
        holder: {
          select: { username: true, displayName: true },
        },
      },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    if (card.status !== 'fruited') {
      return res.status(404).json({ error: 'Card not fruited yet' });
    }

    const patterns = card.patterns as any[];
    const totalSquares = card.episode.gridSize * card.episode.gridSize;
    const completionRate = Math.round((card.markedSquares / totalSquares) * 100);

    // Determine rarity based on completion and patterns
    let rarity = 'Common';
    if (patterns.some((p) => p.type === 'blackout')) {
      rarity = 'Legendary';
    } else if (patterns.length >= 4) {
      rarity = 'Epic';
    } else if (patterns.length >= 2) {
      rarity = 'Rare';
    } else if (patterns.length >= 1) {
      rarity = 'Uncommon';
    }

    const metadata = {
      name: `StreamTree Fruit #${card.cardNumber} - ${card.episode.name}`,
      description: `Soulbound collectible proving participation in "${card.episode.name}". Completed ${patterns.length} pattern(s) with ${completionRate}% card completion.`,
      image: card.episode.artworkUrl || `${process.env.BASE_URL}/default-fruit.png`,
      external_url: `${process.env.BASE_URL}/card/${card.id}`,
      attributes: [
        {
          trait_type: 'Type',
          value: 'Fruit',
        },
        {
          trait_type: 'Rarity',
          value: rarity,
        },
        {
          trait_type: 'Card Number',
          value: card.cardNumber,
          display_type: 'number',
        },
        {
          trait_type: 'Episode',
          value: card.episode.name,
        },
        {
          trait_type: 'Final Score',
          value: card.markedSquares,
          display_type: 'number',
        },
        {
          trait_type: 'Completion Rate',
          value: completionRate,
          display_type: 'percentage',
        },
        {
          trait_type: 'Patterns Completed',
          value: patterns.length,
          display_type: 'number',
        },
        {
          trait_type: 'Has Bingo',
          value: patterns.length > 0 ? 'Yes' : 'No',
        },
        {
          trait_type: 'Has Blackout',
          value: patterns.some((p) => p.type === 'blackout') ? 'Yes' : 'No',
        },
        {
          trait_type: 'Holder',
          value: card.holder.displayName || card.holder.username,
        },
        {
          trait_type: 'Fruited',
          value: card.fruitedAt ? Math.floor(card.fruitedAt.getTime() / 1000) : 0,
          display_type: 'date',
        },
        {
          trait_type: 'Soulbound',
          value: 'Yes',
        },
      ],
      // Mark as non-transferable
      properties: {
        is_soulbound: true,
      },
    };

    res.json(metadata);
  } catch (error) {
    next(error);
  }
});

export { router as metadataRouter };
