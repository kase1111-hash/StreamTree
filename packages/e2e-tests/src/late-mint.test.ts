import { describe, it, expect, beforeAll } from 'vitest';
import {
  api,
  createTestStreamer,
  createTestUser,
  createTestEpisode,
  launchEpisode,
  randomString,
} from './utils';

describe('Minting after events have fired', () => {
  let streamer: { user: any; token: string };
  let viewer: { user: any; token: string };
  let episode: any;
  let minted: any;

  beforeAll(async () => {
    streamer = await createTestStreamer(`latehost_${randomString()}`);
    viewer = await createTestUser(`latefan_${randomString()}`);

    // With a single event every square on a 3x3 card is that event, so a card
    // minted after it fires is fully marked: 3 rows, 3 columns, 2 diagonals
    // and a blackout
    episode = await createTestEpisode(streamer.token, {
      name: 'Late Mint Episode',
      gridSize: 3,
      events: [{ name: 'Only Event', icon: '🎯' }],
    });
    await launchEpisode(episode.id, streamer.token);

    const eventId = episode.eventDefinitions[0].id;
    const fired = await api(`/api/episodes/${episode.id}/events/${eventId}/fire`, {
      method: 'POST',
      token: streamer.token,
    });
    if (!fired.success) {
      throw new Error(`Failed to fire event: ${fired.error?.message}`);
    }

    minted = await api(`/api/cards/mint/${episode.id}`, {
      method: 'POST',
      token: viewer.token,
    });
    if (!minted.success) {
      throw new Error(`Failed to mint card: ${minted.error?.message}`);
    }
  });

  it('records the patterns that already-fired events complete', () => {
    expect(minted.data.markedSquares).toBe(9);
    expect(minted.data.patterns).toHaveLength(9);
    expect(minted.data.patterns).toContainEqual({ type: 'blackout' });
  });

  it('scores the late card on the leaderboard', async () => {
    const leaderboard = await api(`/api/public/episode/${episode.shareCode}/leaderboard`);

    expect(leaderboard.success).toBe(true);
    expect(leaderboard.data).toHaveLength(1);
    expect(leaderboard.data[0].patterns).toBe(9);
    // 3 rows + 3 columns (100 each) + 2 diagonals (150 each) + blackout (500)
    // + 9 marked squares
    expect(leaderboard.data[0].score).toBe(1409);
  });
});
