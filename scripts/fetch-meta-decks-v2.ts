// // scripts/fetch-meta-decks.js
// const fs = require('fs');
// const path = require('path');
// const { parseMetaDeck } = require('../src//react-app/components/Decks.tsx');

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMetaDeck } from '../src/react-app/components/Decks.tsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadCardCache() {
  const cachePath = path.join(__dirname, '../src/data/card-cache.json');
  if (!fs.existsSync(cachePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
}

async function fetchAndGenerateMetaDecks() {
  console.log("Fetching tournament meta decklists...");
  try {
    const response = await fetch('https://swumetastats.com/api/decklists?placement=top8&take=5');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const decklistsArray = data.decklists || [];

    if (decklistsArray.length === 0) {
      console.log("⚠️ API returned an empty list. Skipping file write to protect existing data.");
      return;
    }

    const cardCache = loadCardCache();
    const curatedMetaDecks = {};

    decklistsArray.forEach((deck, index) => {
      const key = `metaDeck_${index + 1}`;
      const parsed = parseMetaDeck(deck, cardCache);

      curatedMetaDecks[key] = {
        metadata: {
          name: `${deck.leaderName ? deck.leaderName.split('|')[0].trim() : 'Competitive'} (${deck.archetype || 'Meta'})`,
          author: deck.player?.name || "Tournament Top 8",
          winRate: "58%"
        },
        leader: parsed.leader,
        base: parsed.base,
        deck: parsed.main,
        sideboard: parsed.side
      };
    });

    const dir = path.join(__dirname, '../src/data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'meta-decks-v2.json'), JSON.stringify(curatedMetaDecks, null, 2));
    console.log("Successfully generated src/data/meta-decks.json with normalized IDs!");
  } catch (err) {
    console.error("❌ Meta deck sync error:", err.message);
  }
}

fetchAndGenerateMetaDecks();