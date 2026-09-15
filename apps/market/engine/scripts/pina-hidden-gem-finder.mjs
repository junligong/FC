#!/usr/bin/env node
/**
 * 作用：整合全量球员数据，筛选符合Pina进化条件的低价潜力卡。
 * 
 * Uses ALL player data from FCMaster project:
 * - icons/data/prices/fc26/base-icons.json (129 icons, with rowText)
 * - heroes/data/prices/fc26/base-heroes.json (93 heroes, with rowText)
 * - gold/data/prices/fc26/fc26-first-month.json (152 gold, with fc27Rating but no rowText)
 * - /tmp/fc27-pina-analysis.json (66 FC27 gold, with full stats from earlier scrape)
 * 
 * Parses rowText to extract: PAC, SHO, PAS, DRI, DEF, PHY, skills, weakFoot, height, acceleRATE
 * Runs Pina similarity model to find "hidden gems" in FC27
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

// ─── Pina FC26 reference profile ───
const PINA_FC26 = {
  name: 'Claudia Pina Medina',
  nameZh: '克劳蒂亚·皮纳',
  rating: 86,
  position: 'CAM',
  pac: 79, sho: 86, pas: 83, dri: 87, def: 45, phy: 71,
  skills: 4, weakFoot: 5,
  height: 160,
  acceleRATE: 'Controlled',
  igs: 2189,
  futbinRating: 76.9,
  price: 9200,
};

// ─── Parse rowText ───
// Format: "89 Papin Base Heroes 89 ST++ 19.75K 75.6 ST - AF 3 4 83 93 73 83 44 76 82 2212 176cm | 5'9' Explosive"
// Fields: rating name type rating2 position price futbinRating role - typeCode skills weakFoot pac sho pas dri def phy igs_height igs_total heightStr acceleRATE
function parseRowText(rowText) {
  if (!rowText) return null;
  // Split by space
  const parts = rowText.trim().split(/\s+/);
  // Find the numeric stats block: after the position/role info, we have skills weakFoot pac sho pas dri def phy
  // Pattern: ... [skills] [weakFoot] [pac] [sho] [pas] [dri] [def] [phy] [igs_part] [igs_total] [heightStr] [acceleRATE]
  
  // Find acceleRATE keyword (Explosive/Controlled/Lengthy) at the end
  const accelMatch = rowText.match(/(Explosive|Controlled|Lengthy)\s*$/);
  const acceleRATE = accelMatch ? accelMatch[1] : null;
  
  // Find height pattern: "NNNcm | N'N'"
  const heightMatch = rowText.match(/(\d+)cm\s*\|/);
  const height = heightMatch ? parseInt(heightMatch[1]) : null;
  
  // Find skills and weakFoot: two consecutive small integers (3-5) before the 6 face stats
  // The 6 face stats are: PAC SHO PAS DRI DEF PHY (each 20-99)
  // Before them: skills (3-5) weakFoot (3-5)
  // After the role info "ST - AF" or "CAM - C10"
  
  // Strategy: find the IGS total (large number 1800-2800) and work backwards
  // Before IGS total: 8 numbers = skills, weakFoot, pac, sho, pas, dri, def, phy
  const nums = rowText.match(/\d+/g);
  if (!nums) return null;
  
  // Find the IGS total (should be around 2000-2800)
  let igsTotalIdx = -1;
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = parseInt(nums[i]);
    if (n >= 1800 && n <= 3000) { igsTotalIdx = i; break; }
  }
  
  if (igsTotalIdx < 7) return null; // Need at least 8 numbers before IGS total
  
  // The 8 numbers before IGS total: skills, weakFoot, pac, sho, pas, dri, def, phy
  const skills = parseInt(nums[igsTotalIdx - 8]);
  const weakFoot = parseInt(nums[igsTotalIdx - 7]);
  const pac = parseInt(nums[igsTotalIdx - 6]);
  const sho = parseInt(nums[igsTotalIdx - 5]);
  const pas = parseInt(nums[igsTotalIdx - 4]);
  const dri = parseInt(nums[igsTotalIdx - 3]);
  const def = parseInt(nums[igsTotalIdx - 2]);
  const phy = parseInt(nums[igsTotalIdx - 1]);
  const igs = parseInt(nums[igsTotalIdx]);
  
  // Extract rating (first number)
  const rating = parseInt(nums[0]);
  
  // Extract name and position from rowText
  // Format: "95 Maradona Icon 95 CAM++ ST 894K 83.9 CAM - C10 5 3 ..."
  const nameMatch = rowText.match(/^\d+\s+(.+?)\s+(?:Icon|Base Heroes|Heroes|Hero)\s+/);
  const name = nameMatch ? nameMatch[1].trim() : null;
  
  // Extract position
  const posMatch = rowText.match(/(?:Icon|Heroes|Hero)\s+\d+\s+(\w+)/);
  const position = posMatch ? posMatch[1].replace(/\++.*$/, '') : null;
  
  // Extract futbin rating
  const futbinMatch = rowText.match(/(\d+\.\d+)\s*(?:[A-Z]+)/);
  const futbinRating = futbinMatch ? parseFloat(futbinMatch[1]) : null;
  
  // Extract price
  const priceMatch = rowText.match(/(\d+(?:\.\d+)?)K\s/);
  let price = null;
  if (priceMatch) {
    price = parseFloat(priceMatch[1]) * 1000;
  } else {
    const priceM = rowText.match(/(\d+(?:\.\d+)?)M\s/);
    if (priceM) price = parseFloat(priceM[1]) * 1000000;
  }
  
  return {
    rating, name, position,
    pac, sho, pas, dri, def, phy,
    skills, weakFoot, height, acceleRATE,
    igs, futbinRating, price
  };
}

// ─── Pina Similarity Model ───
function pinaSimilarity(player) {
  let score = 0;
  const reasons = [];
  
  // 1. PAC: Pina has 79 (low for attacker). Low PAC = hidden gem potential
  if (player.pac !== null && player.pac !== undefined) {
    if (player.pac <= 82) {
      score += 15;
      reasons.push(`PAC ${player.pac} (low for position)`);
      if (player.pac <= 80) {
        score += 10;
        reasons.push('PAC very low like Pina');
      }
    } else if (player.pac <= 85) {
      score += 5;
      reasons.push(`PAC ${player.pac} (moderate)`);
    }
  }
  
  // 2. DRI: Pina has 87 (elite). High DRI is essential
  if (player.dri) {
    if (player.dri >= 87) {
      score += 15;
      reasons.push(`DRI ${player.dri}`);
      if (player.dri >= 88) {
        score += 10;
        reasons.push('DRI elite');
      }
    } else if (player.dri >= 84) {
      score += 8;
    }
  }
  
  // 3. SHO: Pina has 86 (high for CAM)
  if (player.sho && player.sho >= 83) {
    score += 10;
    reasons.push(`SHO ${player.sho}`);
  }
  
  // 4. Weak Foot: Pina has 5★
  if (player.weakFoot === 5) {
    score += 15;
    reasons.push('WF 5*');
    reasons.push('5* WF like Pina');
  } else if (player.weakFoot === 4) {
    score += 5;
  }
  
  // 5. Skills: Pina has 4★
  if (player.skills === 4) {
    score += 8;
    reasons.push('Skills 4*');
  } else if (player.skills === 5) {
    score += 12;
    reasons.push('Skills 5*');
  }
  
  // 6. Height: Pina is 160cm (very short)
  if (player.height) {
    if (player.height <= 165) {
      score += 15;
      reasons.push(`Height ${player.height}cm`);
      reasons.push('Short like Pina');
    } else if (player.height <= 170) {
      score += 10;
      reasons.push(`Height ${player.height}cm`);
      reasons.push('Short like Pina');
    } else if (player.height <= 175) {
      score += 5;
      reasons.push(`Height ${player.height}cm`);
    }
  }
  
  // 7. AcceleRATE: Pina is Controlled (not Explosive)
  if (player.acceleRATE === 'Controlled') {
    score += 5;
    reasons.push('Controlled accel');
  } else if (player.acceleRATE === 'Explosive') {
    score += 3;
    reasons.push('Explosive accel');
  }
  
  // 8. FUTBIN rating vs OVR: Pina has 76.9 vs 86 (+negative = community rates HIGHER)
  if (player.futbinRating && player.rating) {
    const diff = player.futbinRating - player.rating;
    if (diff > 0) {
      score += Math.min(15, Math.round(diff * 3));
      reasons.push(`FUTBIN ${player.futbinRating} vs OVR ${player.rating} (+${diff.toFixed(1)})`);
    }
  }
  
  // 9. OVR: Pina is 86 (not elite). Low OVR = hidden gem
  if (player.rating) {
    if (player.rating <= 87) {
      score += 10;
      reasons.push(`OVR ${player.rating} (not elite)`);
    } else if (player.rating <= 89) {
      score += 5;
    }
  }
  
  // 10. DEF: Pina has 45 (low, attacker profile)
  if (player.def !== null && player.def <= 55) {
    score += 3;
    reasons.push('Low DEF (attacker)');
  }
  
  return { score, reasons };
}

// ─── Main ───
async function main() {
  console.log('=== Pina Hidden Gem Finder ===\n');
  
  const allPlayers = [];
  
  // 1. Load icons (129)
  const iconsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'icons/data/prices/fc26/base-icons.json'), 'utf8'));
  for (const p of iconsData.players) {
    const parsed = parseRowText(p.rowText);
    if (parsed) {
      allPlayers.push({
        ...parsed,
        slug: p.slug,
        nameZh: p.nameZh || p.name,
        cardType: 'icon',
        fc26Url: p.url,
        source: 'icons'
      });
    }
  }
  console.log(`Icons parsed: ${allPlayers.filter(p => p.cardType === 'icon').length}`);
  
  // 2. Load heroes (93)
  const heroesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'heroes/data/prices/fc26/base-heroes.json'), 'utf8'));
  for (const p of heroesData.players) {
    const parsed = parseRowText(p.rowText);
    if (parsed) {
      allPlayers.push({
        ...parsed,
        slug: p.slug,
        nameZh: p.nameZh || p.name,
        cardType: 'hero',
        fc26Url: p.url,
        source: 'heroes'
      });
    }
  }
  console.log(`Heroes parsed: ${allPlayers.filter(p => p.cardType === 'hero').length}`);
  
  // 3. Load FC27 gold players from /tmp (66)
  const tmpPath = '/tmp/fc27-pina-analysis.json';
  if (fs.existsSync(tmpPath)) {
    const goldData = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
    for (const p of goldData) {
      allPlayers.push({
        name: p.name,
        nameZh: p.name, // No Chinese name in tmp data
        slug: p.slug,
        rating: p.rating,
        position: p.position,
        pac: p.pac, sho: p.sho, pas: p.pas, dri: p.dri, def: p.def, phy: p.phy,
        skills: p.skills, weakFoot: p.weakFoot,
        height: p.height,
        acceleRATE: p.heightInfo ? (p.heightInfo.includes('Explosive') ? 'Explosive' : p.heightInfo.includes('Lengthy') ? 'Lengthy' : 'Controlled') : null,
        igs: p.igs,
        futbinRating: p.futbinRating,
        cardType: 'gold',
        fc27Url: `https://www.futbin.com/27/player/${p.id}/${p.slug}`,
        source: 'fc27-gold-tmp'
      });
    }
    console.log(`Gold (from tmp): ${allPlayers.filter(p => p.cardType === 'gold').length}`);
  }
  
  // 4. Load gold first-month for FC27 ratings (supplement missing gold players)
  const goldFirstMonth = JSON.parse(fs.readFileSync(path.join(ROOT, 'gold/data/prices/fc26/fc26-first-month.json'), 'utf8'));
  const existingSlugs = new Set(allPlayers.map(p => p.slug));
  let goldSupplement = 0;
  for (const p of goldFirstMonth.players) {
    if (!existingSlugs.has(p.slug)) {
      // We have fc27Rating and fc27Position but no detailed stats
      allPlayers.push({
        name: p.name,
        nameZh: p.nameZh || p.name,
        slug: p.slug,
        rating: p.fc27Rating,
        position: p.fc27Position,
        pac: null, sho: null, pas: null, dri: null, def: null, phy: null,
        skills: null, weakFoot: null, height: null, acceleRATE: null,
        igs: null, futbinRating: null,
        cardType: 'gold',
        fc27Url: p.fc27Url,
        fc26Url: p.fc26Url,
        source: 'gold-first-month'
      });
      goldSupplement++;
    }
  }
  console.log(`Gold supplement (no stats): ${goldSupplement}`);
  
  console.log(`\nTotal players: ${allPlayers.length}`);
  
  // 5. Run Pina similarity model on all players with stats
  const scored = [];
  for (const p of allPlayers) {
    // Skip players without core stats
    if (p.pac === null || p.dri === null) continue;
    
    const { score, reasons } = pinaSimilarity(p);
    p.pinaScore = score;
    p.reasons = reasons;
    scored.push(p);
  }
  
  // Sort by pinaScore descending
  scored.sort((a, b) => b.pinaScore - a.pinaScore);
  
  console.log(`\nScored players (with stats): ${scored.length}`);
  console.log('\n=== Top 30 Pina Similarity ===');
  for (let i = 0; i < Math.min(30, scored.length); i++) {
    const p = scored[i];
    console.log(`${i + 1}. [${p.cardType}] ${p.name} (${p.nameZh}) - Score: ${p.pinaScore} - OVR: ${p.rating} - PAC: ${p.pac} DRI: ${p.dri} SHO: ${p.sho} WF: ${p.weakFoot}★ Skills: ${p.skills}★ H: ${p.height}cm - ${p.acceleRATE}`);
    console.log(`   Reasons: ${p.reasons.join(', ')}`);
  }
  
  // 6. Filter for "hidden gems" - gold players only, not icons/heroes
  const hiddenGems = scored.filter(p => p.cardType === 'gold');
  console.log(`\n=== Gold Hidden Gems (Top 20) ===`);
  for (let i = 0; i < Math.min(20, hiddenGems.length); i++) {
    const p = hiddenGems[i];
    console.log(`${i + 1}. ${p.name} (${p.nameZh}) - Score: ${p.pinaScore} - OVR: ${p.rating} - PAC: ${p.pac} DRI: ${p.dri} SHO: ${p.sho} WF: ${p.weakFoot}★ Skills: ${p.skills}★ H: ${p.height}cm`);
  }
  
  // 7. Save results
  const outputPath = path.join(ROOT, 'output/pina-hidden-gem-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    pinaProfile: PINA_FC26,
    totalPlayers: allPlayers.length,
    scoredPlayers: scored.length,
    topAll: scored.slice(0, 30),
    hiddenGems: hiddenGems.slice(0, 20),
    allScored: scored
  }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
  
  return { scored, hiddenGems };
}

main().catch(console.error);
