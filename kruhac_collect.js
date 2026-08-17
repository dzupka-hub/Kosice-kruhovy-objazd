// Meranie prejazdu krizovatkou Kostolianska x Cesta pod Hradovou x Vodarenska
// (od 2025 kruhovy objazd) - 6 vztahov, porovnatelnych s meranim z 12/2024.
//
// Uzly:  A = Kostolianska cesta 694/39 (smer Kostolany)
//        B = Kostolianska cesta 32     (smer Centrum)
//        C = Cesta pod Hradovou 805/7
//        D = Vodarenska 18
//
// Vystup: data/RRRR-MM.json, data/latest.json, data/merania.csv

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) {
  console.error("Chyba: chyba secret TOMTOM_API_KEY");
  process.exit(1);
}

const UZLY = {
  A: { lat: 48.745627, lon: 21.248161, nazov: "Kostoľany" },
  B: { lat: 48.741193, lon: 21.247421, nazov: "Centrum" },
  C: { lat: 48.743326, lon: 21.246089, nazov: "pod Hradovou" },
  D: { lat: 48.742402, lon: 21.252225, nazov: "Vodárenská" },
};

// Merane vztahy + dlzka z merania 2024 (na kontrolu, ze meriame to iste)
const VZTAHY = [
  { id: "AB", od: "A", do: "B", dlzka2024: 508 },
  { id: "BA", od: "B", do: "A", dlzka2024: 508 },
  { id: "AC", od: "A", do: "C", dlzka2024: 583 },
  { id: "CA", od: "C", do: "A", dlzka2024: 583 },
  { id: "AD", od: "A", do: "D", dlzka2024: 813 },
  { id: "DA", od: "D", do: "A", dlzka2024: 813 },
];

const bod = p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
const pauza = ms => new Promise(r => setTimeout(r, ms));

async function meraj(od, kam) {
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/${bod(od)}:${bod(kam)}/json` +
    `?traffic=true&computeTravelTimeFor=all&travelMode=car&routeType=fastest&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const s = (await res.json()).routes[0].summary;
  return {
    cas: s.travelTimeInSeconds,
    volny: s.noTrafficTravelTimeInSeconds,
    obvykly: s.historicTrafficTravelTimeInSeconds,
    zdrzanie: s.trafficDelayInSeconds,
    dlzka: s.lengthInMeters,
  };
}

(async () => {
  const now = new Date();
  const entry = { t: now.toISOString() };

  for (const v of VZTAHY) {
    try {
      const r = await meraj(UZLY[v.od], UZLY[v.do]);
      entry[v.id] = r;
      const znak = Math.abs(r.dlzka - v.dlzka2024) > 250 ? "  <-- dlzka nesedi s 2024!" : "";
      console.log(
        `${v.id} ${UZLY[v.od].nazov} -> ${UZLY[v.do].nazov}: ${r.cas} s ` +
        `(volne ${r.volny} s, obvykle ${r.obvykly} s, ${r.dlzka} m)${znak}`
      );
    } catch (e) {
      entry[v.id] = { error: true };
      console.error(`${v.id}: CHYBA - ${e.message}`);
    }
    await pauza(400);
  }

  // ---------------------------- JSON ----------------------------
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const monthFile = path.join(
    dataDir,
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}.json`
  );
  const arr = fs.existsSync(monthFile)
    ? JSON.parse(fs.readFileSync(monthFile, "utf8"))
    : [];
  arr.push(entry);
  fs.writeFileSync(monthFile, JSON.stringify(arr));
  fs.writeFileSync(path.join(dataDir, "latest.json"), JSON.stringify(entry, null, 2));

  // ----------------------------- CSV ----------------------------
  const csvFile = path.join(dataDir, "merania.csv");
  const HLAVICKA = ["cas_utc", "datum", "cas", "den_v_tyzdni"]
    .concat(...VZTAHY.map(v => [
      `${v.id}_cas_s`, `${v.id}_volny_s`, `${v.id}_zdrzanie_s`, `${v.id}_dlzka_m`,
    ])).join(";");

  const L = new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now).reduce((a, x) => (a[x.type] = x.value, a), {});

  const riadok = [
    entry.t,
    `${L.day}.${L.month}.${L.year}`,
    `${L.hour}:${L.minute}`,
    L.weekday.replace(".", ""),
  ].concat(...VZTAHY.map(v => {
    const r = entry[v.id];
    return (!r || r.error) ? ["", "", "", ""]
      : [r.cas, r.volny, r.zdrzanie, r.dlzka];
  })).join(";");

  if (!fs.existsSync(csvFile)) fs.writeFileSync(csvFile, "\uFEFF" + HLAVICKA + "\n");
  fs.appendFileSync(csvFile, riadok + "\n");

  console.log(`Zapisane: ${path.basename(monthFile)} (${arr.length} merani), merania.csv`);
})();
