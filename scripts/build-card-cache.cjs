// scripts/build-card-cache.cjs
const fs = require('fs');
const path = require('path');

async function buildCache() {
  console.log("Fetching full card database from SWUDB API...");
  try {
    const response = await fetch('https://api.swu-db.com/cards/search?q=*');
    const json = await response.json();
    
    // SWUDB API returns data wrapped in a "data" property array
    const cardsArray = Array.isArray(json) ? json : (json.data || json.cards || []);
    
    if (cardsArray.length === 0) {
      console.warn("Warning: No cards found or unexpected API response structure:", JSON.stringify(json).slice(0, 200));
      return;
    }

    const cacheMap = {};
    cardsArray.forEach(card => {
      // Handle potential casing differences from the API (e.g. Set vs set, Number vs number)
      const set = card.set || card.Set;
      const number = card.number || card.Number || card.setNumber;
      
      if (!set || !number) return; // Skip if identifiers are missing

      const key = `${set}_${number}`.toUpperCase();
      cacheMap[key] = {
        name: card.name || card.Name,
        subtitle: card.subtitle || card.Subtitle,
        cost: card.cost ?? card.Cost ?? 0,
        type: card.type || card.Type,
        arena: card.arenas?.[0] || card.arena || card.Arena || 'None',
        traits: card.traits || card.Traits || [],
        hp: card.hp ?? card.HP,
        power: card.power ?? card.Power,
        set: set,
        number: number
      };
    });

    const dir = path.join(__dirname, '../src/data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'card-cache.json'), JSON.stringify(cacheMap, null, 2));
    console.log(`Successfully cached ${Object.keys(cacheMap).length} cards to src/data/card-cache.json`);
  } catch (err) {
    console.error("Failed to build offline card cache:", err);
    process.exit(1);
  }
}

buildCache();