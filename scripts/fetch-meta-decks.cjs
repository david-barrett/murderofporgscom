// scripts/fetch-meta-decks.js
const fs = require('fs');
const path = require('path');

// Optional: Map set numbers found in the CDN URLs to your card cache's set prefix codes
const SET_NUMBER_MAP = {
  "01": "SOR", // Spark of Rebellion
  "02": "SHD", // Shadows of the Galaxy
  "03": "TWI", // Twilight of the Republic
  "04": "JTL", // Jump to Lightspeed
  "05": "LOF", // Legends of the Force
  "06": "SEC", // Secrets of Power
  "07": "LAW", // A Lawless Time
  "08": "ASH", // Ashes of the Empire
  "09": "HMW"  // Homeworlds (or whichever matches your cache)
};

function convertCdnIdToCacheId(cdnId) {
  // If it's already in SET_123 format, leave it alone
  if (!cdnId || cdnId.includes('_')) return cdnId;
  
  // Example CDN ID: "07010179" -> Set "07", Variant "01", Number "0179"
  if (cdnId.length >= 8) {
    const setNum = cdnId.substring(0, 2);
    const cardNum = parseInt(cdnId.substring(4), 10); // strips leading zeros for the number part, e.g., "0179" -> 179
    const setPrefix = SET_NUMBER_MAP[setNum] || setNum;
    return `${setPrefix}_${cardNum}`;
  }
  
  return cdnId;
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
    
    const curatedMetaDecks = {};
    decklistsArray.forEach((deck, index) => {
      const key = `metaDeck_${index + 1}`;
      
      const extractAndNormalizeId = (imageUrl, fallback) => {
        if (!imageUrl) return fallback;
        const match = imageUrl.match(/\/([0-9A-Za-z]+)_[A-Z]{2}_/);
        if (match && match[1]) {
          return convertCdnIdToCacheId(match[1]);
        }
        return fallback;
      };

      const allCards = deck.cards || [];
      
      const mainDeckItems = allCards
        .filter(item => item.section === 'MainDeck')
        .map(item => {
          const rawId = extractAndNormalizeId(item.card?.imageUrl, "UNKNOWN");
          return {
            ...item.card,
            id: rawId,
            count: item.count || 1
          };
        });

      const sideboardItems = allCards
        .filter(item => item.section === 'Sideboard')
        .map(item => {
          const rawId = extractAndNormalizeId(item.card?.imageUrl, "UNKNOWN");
          return {
            ...item.card,
            id: rawId,
            count: item.count || 1
          };
        });

      const leaderItem = allCards.find(i => i.section === 'Leader');
      const leaderId = extractAndNormalizeId(deck.leaderCard?.imageUrl || leaderItem?.card?.imageUrl, "JTL_006");

      const baseItem = allCards.find(i => i.section === 'Base');
      const baseId = extractAndNormalizeId(deck.baseCard?.imageUrl || baseItem?.card?.imageUrl, "ASH_025");

      curatedMetaDecks[key] = {
        metadata: {
          name: `${deck.leaderName ? deck.leaderName.split('|')[0].trim() : 'Competitive'} (${deck.archetype || 'Meta'})`,
          author: deck.player?.name || "Tournament Top 8",
          winRate: "58%"
        },
        leader: {
          ...(deck.leaderCard || {}),
          id: leaderId,
          count: 1
        },
        base: {
          ...(deck.baseCard || {}),
          id: baseId,
          count: 1
        },
        deck: mainDeckItems,
        sideboard: sideboardItems
      };
    });

    const dir = path.join(__dirname, '../src/data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'meta-decks.json'), JSON.stringify(curatedMetaDecks, null, 2));
    console.log(`Successfully generated src/data/meta-decks.json with normalized IDs!`);
  } catch (err) {
    console.error("❌ Meta deck sync error:", err.message);
  }
}

fetchAndGenerateMetaDecks();