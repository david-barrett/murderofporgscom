// scripts/debug-api.js
async function inspectApi() {
  console.log("Fetching raw tournament meta decklists from API...");
  try {
    const response = await fetch('https://swumetastats.com/api/decklists?placement=top8&take=1');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    console.log("\n================ RAW API SAMPLE ================");
    console.log(JSON.stringify(data, null, 2));
    console.log("================================================\n");
    
  } catch (err) {
    console.error("❌ Failed to fetch API:", err.message);
  }
}

inspectApi();